import { task, metadata } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { transcripts } from "@/lib/drizzle/schema";
import { eq, desc, ne, and } from "drizzle-orm";

const client = new Anthropic();

const SummarySchema = z.object({
  meetingSummary: z.string(),
  accountSituation: z.string(),
});

interface GenerateSummaryInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  cleanedContent: string;
}

interface GenerateSummaryOutput {
  meetingSummary: string;
  accountSituation: string;
}

export const generateSummary = task({
  id: "generate-summary",
  retry: { maxAttempts: 2 },
  run: async (payload: GenerateSummaryInput): Promise<GenerateSummaryOutput> => {
    await metadata.root.set("progress", 55);
    await metadata.root.set("currentStep", "Generando resumen...");

    // Sort by meetingDate (extracted from content) so historical uploads
    // don't pollute context with random ordering; fall back to createdAt.
    const recentSummaries = await db
      .select({ meetingSummary: transcripts.meetingSummary })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.accountId, payload.accountId),
          ne(transcripts.id, payload.transcriptId)
        )
      )
      .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt))
      .limit(3);

    const context = recentSummaries
      .filter((r) => r.meetingSummary)
      .map((r, i) => `Reunión anterior ${i + 1}: ${r.meetingSummary}`)
      .join("\n\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Sos un analista de cuentas para una agencia de growth. Tu tarea es mantener una ficha actualizada de cada cliente.

${context ? `ESTADO PREVIO DE LA CUENTA (de reuniones anteriores, más reciente primero):\n${context}\n\n` : ""}

Con la siguiente transcripción, generá:

1. meetingSummary: Actualización estructurada del estado de la cuenta. No es un resumen de la reunión, es una ficha de inteligencia del cliente. Formato con saltos de línea:\\n- Primera línea: situación actual en una oración.\\n- Secciones que apliquen (cada punto con "• "): "**Situación actual:**", "**Compromisos pendientes:**", "**Riesgos:**"\\n- NO menciones fechas específicas salvo deadlines críticos.\\n- Máximo 200 palabras.

2. accountSituation: Texto corto (máx 100 palabras) con el momentum y contexto clave para el equipo. Sin fechas.

Respondé SOLO con JSON válido (strings con \\n para saltos de línea):
{"meetingSummary": "...", "accountSituation": "..."}

TRANSCRIPCIÓN:
${payload.cleanedContent.substring(0, 10000)}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: z.infer<typeof SummarySchema>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = SummarySchema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      parsed = { meetingSummary: text, accountSituation: text };
    }

    await db
      .update(transcripts)
      .set({ meetingSummary: parsed.meetingSummary, updatedAt: new Date() })
      .where(eq(transcripts.id, payload.transcriptId));

    await metadata.root.set("progress", 65);
    await metadata.root.set("currentStep", "Resumen generado");

    return parsed;
  },
});
