import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";

const client = new Anthropic();

const EnrichmentSchema = z.object({
  industry: z.string().nullable(),
  employeeCount: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
});

interface EnrichAccountInput {
  accountId: string;
  workspaceId: string;
  websiteUrl: string;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const enrichAccount = task({
  id: "enrich-account",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 10000, factor: 2 },
  run: async (payload: EnrichAccountInput): Promise<void> => {
    const normalized = normalizeUrl(payload.websiteUrl);
    if (!normalized) {
      await db
        .update(accounts)
        .set({
          enrichmentStatus: "failed",
          enrichmentError: "URL inválida",
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, payload.accountId));
      return;
    }

    await db
      .update(accounts)
      .set({
        enrichmentStatus: "pending",
        enrichmentError: null,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, payload.accountId));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(normalized, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; nao.fyi/1.0; +https://nao.fyi)",
          Accept: "text/html,application/xhtml+xml",
        },
      }).catch((err) => {
        throw new Error(`No se pudo acceder al sitio: ${err.message ?? "timeout"}`);
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`El sitio respondió ${res.status}`);
      }

      const rawHtml = await res.text();
      const cleanText = htmlToText(rawHtml).substring(0, 15000);

      if (cleanText.length < 50) {
        throw new Error("El sitio no devolvió contenido legible");
      }

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `Analizá el siguiente contenido del sitio web de una empresa y extraé datos clave para que una agencia de marketing entienda al cliente.

SITIO: ${normalized}

CONTENIDO:
${cleanText}

Devolvé SOLO JSON válido con estas claves. Si no podés inferir un dato con confianza, poné null — nunca inventes.

{
  "industry": "string — una frase corta en español (ej: 'Ecommerce de ropa', 'SaaS B2B de RRHH'). null si no está claro.",
  "employeeCount": "string — uno de: '1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'. null si no podés estimar.",
  "location": "string — ciudad, país (ej: 'Buenos Aires, Argentina'). null si no figura.",
  "description": "string — una o dos oraciones en español describiendo qué hace la empresa y a quién apunta. null si no tenés información.",
  "confidence": "'low' | 'medium' | 'high' — tu confianza global en la extracción."
}`,
          },
        ],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("El modelo no devolvió JSON");
      const parsed = EnrichmentSchema.parse(JSON.parse(jsonMatch[0]));

      await db
        .update(accounts)
        .set({
          industry: parsed.industry,
          employeeCount: parsed.employeeCount,
          location: parsed.location,
          companyDescription: parsed.description,
          enrichedAt: new Date(),
          enrichmentStatus: "ok",
          enrichmentError: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, payload.accountId));

      logger.info("Account enriched", {
        accountId: payload.accountId,
        confidence: parsed.confidence,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      logger.error("Enrichment failed", { accountId: payload.accountId, message });
      await db
        .update(accounts)
        .set({
          enrichmentStatus: "failed",
          enrichmentError: message.substring(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, payload.accountId));
    }
  },
});
