import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { logLlmUsage } from "@/lib/ai/log-usage";
import {
  INDUSTRY_CATEGORIES,
  coerceIndustryCategory,
} from "@/lib/industry-categories";

const MODEL = "claude-haiku-4-5-20251001";
const client = new Anthropic();

const EnrichmentSchema = z.object({
  industry: z.string().nullable(),
  industryCategory: z.string().nullable(),
  employeeCount: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
});

interface EnrichAccountInput {
  accountId: string;
  workspaceId: string;
  websiteUrl: string;
  linkedinUrl?: string | null;
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

    const linkedinUrl = payload.linkedinUrl?.trim() || null;

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

      const categoriesList = INDUSTRY_CATEGORIES.join('", "');

      // Single Claude call with web_search tool. The model uses the website
      // text as primary source and falls back to web_search ONLY when
      // employeeCount is not derivable from the website itself — typical for
      // company sites that don't advertise headcount. LinkedIn employee
      // ranges are public via Google snippets even when the page itself is
      // gated, so the search hits the snippet.
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
          } as never,
        ],
        messages: [
          {
            role: "user",
            content: `Analizá el siguiente contenido del sitio web de una empresa y extraé datos clave para una agencia de marketing.

SITIO: ${normalized}
LINKEDIN: ${linkedinUrl ?? "(no provisto)"}

CONTENIDO DEL SITIO:
${cleanText}

INSTRUCCIONES:
1. Inferí lo que puedas DEL SITIO. Si "employeeCount" no aparece en el sitio Y hay un linkedinUrl, usá la herramienta web_search con la query "${linkedinUrl ?? ""}" o "[nombre empresa] linkedin employees" para encontrar el rango de empleados — los snippets de LinkedIn lo muestran (ej: "11-50 employees").
2. NO inventes. Si no podés inferir un dato con confianza incluso después de buscar, devolvé null.
3. Limitate a 2 búsquedas como máximo. Si no encontrás el dato, devolvé null.

Devolvé SOLO JSON válido al final, sin texto extra antes ni después:

{
  "industry": "frase corta en español describiendo la industria detallada (ej: 'Ecommerce de ropa', 'SaaS B2B de RRHH'). null si no está claro.",
  "industryCategory": "EXACTAMENTE uno de: \\"${categoriesList}\\". Mapeá la industria detallada a su bucket amplio. Si dudás, 'Otros'.",
  "employeeCount": "uno de: '1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'. null si no podés estimar.",
  "location": "ciudad, país (ej: 'Buenos Aires, Argentina'). null si no figura.",
  "description": "una o dos oraciones describiendo qué hace la empresa y a quién apunta. null si no tenés información.",
  "confidence": "'low' | 'medium' | 'high' — tu confianza global."
}`,
          },
        ],
      });

      await logLlmUsage({
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        taskName: "enrich-account",
        model: MODEL,
        usage: response.usage,
      });

      // The response may include tool_use + tool_result blocks before the
      // final text block. Take the LAST text block, which is the answer.
      const textBlocks = response.content.flatMap((b) =>
        b.type === "text" ? [b.text] : []
      );
      const finalText = textBlocks[textBlocks.length - 1] ?? "";
      const jsonMatch = finalText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("El modelo no devolvió JSON");
      const parsed = EnrichmentSchema.parse(JSON.parse(jsonMatch[0]));

      await db
        .update(accounts)
        .set({
          industry: parsed.industry,
          industryCategory: coerceIndustryCategory(parsed.industryCategory),
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
        usedLinkedin: !!linkedinUrl,
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
