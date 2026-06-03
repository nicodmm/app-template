import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accountFinance } from "@/lib/drizzle/schema";
import { logLlmUsage } from "@/lib/ai/log-usage";
import {
  buildNdaUserMessage,
  NDA_EXTRACT_SYSTEM,
} from "@/lib/ai/nda-extract-prompt";

const MODEL = "claude-haiku-4-5-20251001";
const anthropic = new Anthropic();

interface ExtractNdaFieldsInput {
  accountId: string;
  workspaceId: string;
}

interface ExtractedNdaFields {
  razonSocial: string | null;
  cuit: string | null;
  billingEmail: string | null;
  ivaCondition: string | null;
  legalRepName: string | null;
  legalRepDni: string | null;
  legalRepEmail: string | null;
  legalAddress: string | null;
  city: string | null;
  country: string | null;
  clientResponsible: string | null;
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return t.trim();
}

export const extractNdaFields = task({
  id: "extract-nda-fields",
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  run: async (
    payload: ExtractNdaFieldsInput
  ): Promise<{ status: string }> => {
    // 1. Load accountFinance row
    const [financeRow] = await db
      .select()
      .from(accountFinance)
      .where(eq(accountFinance.accountId, payload.accountId))
      .limit(1);

    const ndaText = financeRow?.ndaExtractedText?.trim() ?? "";
    if (!financeRow || !ndaText) {
      logger.info("No finance row or empty NDA text — skipping", {
        accountId: payload.accountId,
      });
      await db
        .update(accountFinance)
        .set({
          ndaExtractionStatus: "error",
          ndaExtractionError: "No hay texto de NDA para analizar",
          updatedAt: new Date(),
        })
        .where(eq(accountFinance.accountId, payload.accountId));
      return { status: "skipped" };
    }

    try {
      // 2. Call Anthropic
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: NDA_EXTRACT_SYSTEM,
        messages: [{ role: "user", content: buildNdaUserMessage(ndaText) }],
      });

      // 3. Log LLM usage
      await logLlmUsage({
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        taskName: "extract-nda-fields",
        model: MODEL,
        usage: resp.usage,
      });

      const text = resp.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("\n");

      // 4. Parse JSON
      let parsed: ExtractedNdaFields;
      try {
        parsed = JSON.parse(stripFences(text)) as ExtractedNdaFields;
      } catch (parseErr) {
        logger.error("Failed to parse LLM JSON", {
          accountId: payload.accountId,
          message:
            parseErr instanceof Error ? parseErr.message : "parse error",
        });
        await db
          .update(accountFinance)
          .set({
            ndaExtractionStatus: "error",
            ndaExtractionError: "No se pudo interpretar la respuesta del modelo",
            updatedAt: new Date(),
          })
          .where(eq(accountFinance.accountId, payload.accountId));
        return { status: "error" };
      }

      // 5. Only fill fields that are currently empty/null in the existing row
      type FillFields = {
        razonSocial?: string;
        cuit?: string;
        billingEmail?: string;
        ivaCondition?: string;
        legalRepName?: string;
        legalRepDni?: string;
        legalRepEmail?: string;
        legalAddress?: string;
        city?: string;
        country?: string;
        clientResponsible?: string;
      };

      const fills: FillFields = {};

      const keys: (keyof ExtractedNdaFields)[] = [
        "razonSocial",
        "cuit",
        "billingEmail",
        "ivaCondition",
        "legalRepName",
        "legalRepDni",
        "legalRepEmail",
        "legalAddress",
        "city",
        "country",
        "clientResponsible",
      ];

      for (const key of keys) {
        const extracted = parsed[key];
        const existing = financeRow[key as keyof typeof financeRow];
        // Only fill if extracted value is non-empty AND existing is null/empty
        if (
          extracted &&
          typeof extracted === "string" &&
          extracted.trim() !== "" &&
          (!existing || (typeof existing === "string" && existing.trim() === ""))
        ) {
          (fills as Record<string, string>)[key] = extracted.trim();
        }
      }

      await db
        .update(accountFinance)
        .set({
          ...fills,
          ndaExtractionStatus: "ready",
          ndaExtractionError: null,
          ndaExtractedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(accountFinance.accountId, payload.accountId));

      logger.info("NDA fields extracted", {
        accountId: payload.accountId,
        filledCount: Object.keys(fills).length,
      });

      return { status: "ready" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      logger.error("NDA extraction failed", {
        accountId: payload.accountId,
        message,
      });
      await db
        .update(accountFinance)
        .set({
          ndaExtractionStatus: "error",
          ndaExtractionError: message.substring(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(accountFinance.accountId, payload.accountId));
      throw err;
    }
  },
});
