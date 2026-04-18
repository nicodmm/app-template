import { task, metadata } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { signals, accounts, accountHealthHistory } from "@/lib/drizzle/schema";
import { eq, and } from "drizzle-orm";

const client = new Anthropic();

const SignalSchema = z.object({
  type: z.enum(["churn_risk", "growth_opportunity", "upsell_opportunity", "inactivity_flag", "custom"]),
  description: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const DetectionSchema = z.object({
  signals: z.array(SignalSchema),
  healthSignal: z.enum(["green", "yellow", "red", "inactive"]),
  healthJustification: z.string(),
});

interface DetectSignalsInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  summaryText: string;
  accountSituation: string;
  adMetricsSnapshot: null;
}

export const detectSignals = task({
  id: "detect-signals",
  retry: { maxAttempts: 2 },
  run: async (payload: DetectSignalsInput): Promise<void> => {
    await metadata.root.set("progress", 75);
    await metadata.root.set("currentStep", "Detectando señales...");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Sos un analista experto en gestión de cuentas para agencias de growth.

Analizá el siguiente resumen de reunión y estado de cuenta, y:
1. Detectá señales relevantes (riesgos de churn, oportunidades de crecimiento, oportunidades de upsell, flags de inactividad)
2. Determiná el estado de salud general de la cuenta

RESUMEN DE REUNIÓN:
${payload.summaryText}

SITUACIÓN DE LA CUENTA:
${payload.accountSituation}

Respondé ÚNICAMENTE con un JSON válido:
{
  "signals": [
    {"type": "churn_risk|growth_opportunity|upsell_opportunity|inactivity_flag|custom", "description": "...", "confidence": "high|medium|low"}
  ],
  "healthSignal": "green|yellow|red|inactive",
  "healthJustification": "..."
}

Solo incluí señales con confianza media o alta. Si no hay señales claras, usá un array vacío.`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: z.infer<typeof DetectionSchema>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON");
      parsed = DetectionSchema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      parsed = { signals: [], healthSignal: "yellow", healthJustification: "No se pudo analizar la transcripción" };
    }

    // Upsert signals — dedup by (accountId, type) for active signals
    for (const sig of parsed.signals) {
      const existing = await db
        .select()
        .from(signals)
        .where(
          and(
            eq(signals.accountId, payload.accountId),
            eq(signals.type, sig.type),
            eq(signals.status, "active")
          )
        )
        .limit(1);

      if (existing[0]) {
        await db
          .update(signals)
          .set({ description: sig.description, updatedAt: new Date() })
          .where(eq(signals.id, existing[0].id));
      } else {
        await db.insert(signals).values({
          accountId: payload.accountId,
          workspaceId: payload.workspaceId,
          transcriptId: payload.transcriptId,
          triggerSource: "transcript_processing",
          type: sig.type,
          status: "active",
          description: sig.description,
        });
      }
    }

    // Update account health
    await db
      .update(accounts)
      .set({
        healthSignal: parsed.healthSignal,
        healthJustification: parsed.healthJustification,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, payload.accountId));

    // Record in health history
    await db.insert(accountHealthHistory).values({
      accountId: payload.accountId,
      workspaceId: payload.workspaceId,
      transcriptId: payload.transcriptId,
      healthSignal: parsed.healthSignal,
      justification: parsed.healthJustification,
    });

    await metadata.root.set("progress", 85);
    await metadata.root.set("currentStep", `${parsed.signals.length} señales detectadas`);
  },
});
