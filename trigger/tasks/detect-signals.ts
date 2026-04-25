import { task, metadata } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import {
  signals,
  accounts,
  accountHealthHistory,
  workspaces,
} from "@/lib/drizzle/schema";
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

    // Pull both the workspace's free-form agency context AND the workspace
    // service catalog. The agency_context gives the LLM background (who they
    // are, ICP, things they care about); the services list is treated as the
    // explicit cross-sell catalog so the LLM can flag opportunities even when
    // the agency didn't literally list them in the context.
    const [ws] = await db
      .select({
        agencyContext: workspaces.agencyContext,
        services: workspaces.services,
      })
      .from(workspaces)
      .where(eq(workspaces.id, payload.workspaceId))
      .limit(1);
    const agencyContext = ws?.agencyContext?.trim() ?? "";
    const services = (ws?.services ?? []).filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0
    );

    const agencyBlock = agencyContext
      ? `CONTEXTO DE LA AGENCIA (background, no son reglas literales — usalo para informar el criterio):\n${agencyContext}\n\n`
      : "";
    const servicesBlock =
      services.length > 0
        ? `CARTERA DE SERVICIOS DE LA AGENCIA (cosas que pueden ofrecer al cliente):\n- ${services.join("\n- ")}\n\n`
        : "";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Sos un analista experto en gestión de cuentas para agencias de growth. Tu rol es estar UN PASO ADELANTE: si el cliente menciona un dolor que la agencia podría resolver con uno de sus servicios, marcalo aunque el equipo no haya pedido explícitamente esa señal.

${agencyBlock}${servicesBlock}Analizá el siguiente resumen de reunión y estado de cuenta y devolvé:
1. Señales relevantes — riesgos de churn, oportunidades de crecimiento, oportunidades de upsell o cross-sell (servicios que podríamos sumar), flags de inactividad. Sé proactivo: si el cliente dice "tengo problemas con X" y X coincide con algún servicio de la cartera, ES una señal aunque el contexto de la agencia no lo haya listado. Cada señal debe ser accionable y específica.
2. Estado de salud general de la cuenta.

REGLAS:
- "upsell_opportunity" = sumar más del MISMO servicio que ya tiene.
- "growth_opportunity" = SUMAR un servicio NUEVO de la cartera (cross-sell). Citá el servicio puntual.
- Sé creativo pero honesto: si el cliente no mencionó algo concreto, NO inventes una oportunidad.

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

Solo incluí señales con confianza media o alta. Si no hay señales claras, devolvé un array vacío.`,
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
