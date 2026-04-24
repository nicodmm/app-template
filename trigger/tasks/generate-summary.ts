import { task, metadata } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { transcripts, accounts, participants } from "@/lib/drizzle/schema";
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

function monthsBetween(from: string | null, to: Date): number | null {
  if (!from) return null;
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return null;
  const years = to.getFullYear() - start.getFullYear();
  const months = to.getMonth() - start.getMonth();
  const total = years * 12 + months - (to.getDate() < start.getDate() ? 1 : 0);
  return total < 0 ? 0 : total;
}

function buildAccountFactsBlock(args: {
  accountName: string;
  monthsAsClient: number | null;
  fee: string | null;
  serviceScope: string | null;
  healthSignal: string | null;
  healthJustification: string | null;
  participantsList: Array<{ name: string; role: string | null; confidence: string; appearanceCount: number }>;
}): string {
  const lines: string[] = [];
  lines.push(`Cliente: ${args.accountName}`);
  if (args.monthsAsClient !== null) {
    lines.push(`Meses como cliente: ${args.monthsAsClient}`);
  }
  if (args.fee) {
    lines.push(`Fee mensual (USD): ${Number(args.fee).toFixed(2)}`);
  }
  if (args.serviceScope) {
    lines.push(`Servicios contratados: ${args.serviceScope}`);
  }
  if (args.healthSignal) {
    const signalLabel =
      args.healthSignal === "green"
        ? "verde"
        : args.healthSignal === "yellow"
        ? "amarillo"
        : args.healthSignal === "red"
        ? "rojo"
        : args.healthSignal;
    lines.push(`Estado de salud actual: ${signalLabel}`);
  }
  if (args.healthJustification) {
    lines.push(`Justificación del estado: ${args.healthJustification}`);
  }
  if (args.participantsList.length > 0) {
    lines.push("Participantes frecuentes en reuniones:");
    for (const p of args.participantsList) {
      const parts = [p.name];
      if (p.role) parts.push(`rol: ${p.role}`);
      parts.push(`apariciones: ${p.appearanceCount}`);
      parts.push(`confianza: ${p.confidence}`);
      lines.push(`  - ${parts.join(" · ")}`);
    }
  }
  return lines.join("\n");
}

export const generateSummary = task({
  id: "generate-summary",
  retry: { maxAttempts: 2 },
  run: async (payload: GenerateSummaryInput): Promise<GenerateSummaryOutput> => {
    await metadata.root.set("progress", 55);
    await metadata.root.set("currentStep", "Generando resumen...");

    const [accountRow] = await db
      .select({
        name: accounts.name,
        startDate: accounts.startDate,
        fee: accounts.fee,
        serviceScope: accounts.serviceScope,
        healthSignal: accounts.healthSignal,
        healthJustification: accounts.healthJustification,
      })
      .from(accounts)
      .where(eq(accounts.id, payload.accountId))
      .limit(1);

    const topParticipants = await db
      .select({
        name: participants.name,
        role: participants.role,
        confidence: participants.confidence,
        appearanceCount: participants.appearanceCount,
      })
      .from(participants)
      .where(eq(participants.accountId, payload.accountId))
      .orderBy(desc(participants.lastSeenAt), desc(participants.appearanceCount))
      .limit(5);

    const accountFacts = buildAccountFactsBlock({
      accountName: accountRow?.name ?? "(desconocido)",
      monthsAsClient: monthsBetween(accountRow?.startDate ?? null, new Date()),
      fee: accountRow?.fee ?? null,
      serviceScope: accountRow?.serviceScope ?? null,
      healthSignal: accountRow?.healthSignal ?? null,
      healthJustification: accountRow?.healthJustification ?? null,
      participantsList: topParticipants,
    });

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

    const priorContext = recentSummaries
      .filter((r) => r.meetingSummary)
      .map((r, i) => `Reunión anterior ${i + 1}: ${r.meetingSummary}`)
      .join("\n\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Sos un analista de cuentas para una agencia de growth. Tu tarea es mantener una ficha actualizada del cliente.

FICHA DEL CLIENTE (datos duros — usalos textualmente cuando aparezcan):
${accountFacts}

${priorContext ? `ESTADO PREVIO (reuniones anteriores, más reciente primero):\n${priorContext}\n\n` : ""}TRANSCRIPCIÓN DE LA ÚLTIMA REUNIÓN:
${payload.cleanedContent.substring(0, 10000)}

Con toda esa información generá dos salidas en JSON:

1. "meetingSummary" — Actualización estructurada del estado de la cuenta (NO es resumen de reunión, es ficha de inteligencia). Formato con saltos de línea (\\n):
   - Primera línea: situación actual en una oración.
   - Secciones que apliquen con bullet "• ": "**Situación actual:**", "**Compromisos pendientes:**", "**Riesgos:**"
   - NO menciones fechas salvo deadlines críticos.
   - Máximo 200 palabras.

2. "accountSituation" — Resumen de situación para el equipo, en DOS secciones con este formato EXACTO (dos párrafos separados por doble salto de línea, cada uno con su header en **negritas**):

**Contexto del cliente**
Una oración que use LOS DATOS DUROS: "{N} meses como cliente. Fee mensual USD {fee}. Servicios contratados: {scope}." Seguí con: "Hoy el proyecto está enfocado en {prioridades del último mes}." Si corresponde cerrá con "Atención: {riesgo u oportunidad que habría que mirar}." Omití cualquier cláusula cuyo dato no esté disponible en la ficha — no inventes.

**Estado de la cuenta**
Una oración tipo: "Cuenta en estado {verde|amarillo|rojo} porque {razón basada en la transcripción y el estado actual}." Luego: "Le interesa principalmente {X}." Luego: "{Nombre del interlocutor del lado del cliente} se lo nota {bien|mal|confiado|preocupado|etc. — inferido de cómo habla}." Cerrá con "Próximos pasos: {acciones concretas}."

Elegí al interlocutor desde la lista de participantes frecuentes (no de la agencia). Si no estás seguro, omití el nombre y decí "el interlocutor".

Prosa, NO bullets, NO fechas específicas. Máximo 180 palabras la sección "accountSituation" completa.

Respondé SOLO con JSON válido (strings con \\n para saltos de línea):
{"meetingSummary": "...", "accountSituation": "..."}`,
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
