import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import {
  accounts,
  participants,
  transcripts,
  contextDocuments,
} from "@/lib/drizzle/schema";
import { eq, desc, ne, and } from "drizzle-orm";
import { logLlmUsage } from "@/lib/ai/log-usage";

const anthropic = new Anthropic();
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";

const SummarySchema = z.object({
  meetingSummary: z.string(),
  accountSituation: z.string(),
});

export type AccountSummaryOutput = z.infer<typeof SummarySchema>;

function monthsBetween(from: string | null, to: Date): number | null {
  if (!from) return null;
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return null;
  const years = to.getFullYear() - start.getFullYear();
  const months = to.getMonth() - start.getMonth();
  const total = years * 12 + months - (to.getDate() < start.getDate() ? 1 : 0);
  return total < 0 ? 0 : total;
}

function healthSignalLabel(signal: string | null): string | null {
  if (!signal) return null;
  if (signal === "green") return "verde";
  if (signal === "yellow") return "amarillo";
  if (signal === "red") return "rojo";
  return signal;
}

function buildAccountFactsBlock(args: {
  accountName: string;
  monthsAsClient: number | null;
  fee: string | null;
  serviceScope: string | null;
  healthSignal: string | null;
  healthJustification: string | null;
  industry: string | null;
  companyDescription: string | null;
  participantsList: Array<{
    name: string;
    role: string | null;
    confidence: string;
    appearanceCount: number;
  }>;
}): string {
  const lines: string[] = [];
  lines.push(`Cliente: ${args.accountName}`);
  if (args.industry) lines.push(`Industria: ${args.industry}`);
  if (args.companyDescription) lines.push(`Descripción: ${args.companyDescription}`);
  if (args.monthsAsClient !== null) {
    lines.push(`Meses como cliente: ${args.monthsAsClient}`);
  }
  if (args.fee) {
    lines.push(`Fee mensual (USD): ${Number(args.fee).toFixed(2)}`);
  }
  if (args.serviceScope) {
    lines.push(`Servicios contratados: ${args.serviceScope}`);
  }
  const healthLabel = healthSignalLabel(args.healthSignal);
  if (healthLabel) lines.push(`Estado de salud actual: ${healthLabel}`);
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

function buildContextDocsBlock(
  docs: Array<{
    docType: string;
    title: string;
    notes: string | null;
    body: string | null;
    createdAt: Date;
  }>
): string {
  if (docs.length === 0) return "";
  const lines: string[] = [];
  lines.push("ARCHIVOS DE CONTEXTO APORTADOS POR EL EQUIPO");
  lines.push(
    "(Son ground truth: reportes, notas, planillas, mensajes. Tomalos en cuenta con peso igual o mayor que la transcripción cuando aporten datos concretos que la transcripción no tiene.)"
  );
  for (const d of docs) {
    const when = d.createdAt.toISOString().slice(0, 10);
    lines.push("");
    lines.push(`--- [${d.docType}] ${d.title} · ${when} ---`);
    if (d.notes) lines.push(`Descripción del equipo: ${d.notes}`);
    if (d.body) {
      const cap = d.body.length > 2500 ? d.body.slice(0, 2500) + "..." : d.body;
      lines.push(cap);
    }
  }
  return lines.join("\n");
}

interface GenerateOptions {
  accountId: string;
  workspaceId: string;
  transcriptId: string;
  cleanedContent: string;
  priorContextLimit?: number;
}

export async function runAccountSummaryGeneration(
  opts: GenerateOptions
): Promise<AccountSummaryOutput> {
  const [accountRow] = await db
    .select({
      name: accounts.name,
      startDate: accounts.startDate,
      fee: accounts.fee,
      serviceScope: accounts.serviceScope,
      healthSignal: accounts.healthSignal,
      healthJustification: accounts.healthJustification,
      industry: accounts.industry,
      companyDescription: accounts.companyDescription,
    })
    .from(accounts)
    .where(eq(accounts.id, opts.accountId))
    .limit(1);

  const topParticipants = await db
    .select({
      name: participants.name,
      role: participants.role,
      confidence: participants.confidence,
      appearanceCount: participants.appearanceCount,
    })
    .from(participants)
    .where(eq(participants.accountId, opts.accountId))
    .orderBy(desc(participants.lastSeenAt), desc(participants.appearanceCount))
    .limit(5);

  const docs = await db
    .select({
      docType: contextDocuments.docType,
      title: contextDocuments.title,
      notes: contextDocuments.notes,
      extractedText: contextDocuments.extractedText,
      createdAt: contextDocuments.createdAt,
    })
    .from(contextDocuments)
    .where(eq(contextDocuments.accountId, opts.accountId))
    .orderBy(desc(contextDocuments.createdAt))
    .limit(8);

  const priorLimit = opts.priorContextLimit ?? 3;
  const recentSummaries = await db
    .select({ meetingSummary: transcripts.meetingSummary })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.accountId, opts.accountId),
        ne(transcripts.id, opts.transcriptId)
      )
    )
    .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt))
    .limit(priorLimit);

  const accountFacts = buildAccountFactsBlock({
    accountName: accountRow?.name ?? "(desconocido)",
    monthsAsClient: monthsBetween(accountRow?.startDate ?? null, new Date()),
    fee: accountRow?.fee ?? null,
    serviceScope: accountRow?.serviceScope ?? null,
    healthSignal: accountRow?.healthSignal ?? null,
    healthJustification: accountRow?.healthJustification ?? null,
    industry: accountRow?.industry ?? null,
    companyDescription: accountRow?.companyDescription ?? null,
    participantsList: topParticipants,
  });

  const contextBlock = buildContextDocsBlock(
    docs.map((d) => ({
      docType: d.docType,
      title: d.title,
      notes: d.notes,
      body: d.extractedText ?? d.notes ?? null,
      createdAt: d.createdAt,
    }))
  );

  const priorContext = recentSummaries
    .filter((r) => r.meetingSummary)
    .map((r, i) => `Reunión anterior ${i + 1}: ${r.meetingSummary}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `Sos un analista de cuentas para una agencia de growth. Mantenés una ficha actualizada del cliente.

REGLA IMPORTANTE DE ESCRITURA:
- La transcripción puede tener errores de reconocimiento de voz: palabras mezcladas, anglicismos mal escritos, nombres fonetizados (ej. "colemail" en vez de "cold email", "ses plenai" en vez de "sales pipeline", "performand sell" en vez de "performance sales"). Cuando detectes un error obvio, usá el término correcto — NO copies literal lo que está mal transcripto.
- Si no estás seguro del término correcto, dejalo de la forma más entendible pero corrigiendo la grafía obvia.
- Nombres propios: respetá el nombre más consistente en la transcripción y los participantes frecuentes.

FICHA DEL CLIENTE (datos duros — usalos textualmente cuando aparezcan):
${accountFacts}

${contextBlock ? contextBlock + "\n\n" : ""}${priorContext ? `ESTADO PREVIO (reuniones anteriores, más reciente primero):\n${priorContext}\n\n` : ""}TRANSCRIPCIÓN DE LA ÚLTIMA REUNIÓN:
${opts.cleanedContent.substring(0, 10000)}

Con toda esa información generá dos salidas en JSON:

1. "meetingSummary" — Actualización estructurada del estado de la cuenta (NO es resumen de la reunión, es ficha de inteligencia). Formato con saltos de línea (\\n):
   - Primera línea: situación actual en una oración.
   - Secciones que apliquen con bullet "• ": "**Situación actual:**", "**Compromisos pendientes:**", "**Riesgos:**"
   - NO menciones fechas salvo deadlines críticos.
   - Máximo 200 palabras.

2. "accountSituation" — Resumen ESTRATÉGICO para el equipo, en DOS secciones con este formato EXACTO (dos párrafos separados por doble salto de línea, cada uno con su header en **negritas**):

**Contexto del cliente**
Una oración que use LOS DATOS DUROS: "{N} meses como cliente. Fee mensual USD {fee}. Servicios contratados: {scope}." Seguí con: "Hoy el proyecto está enfocado en {prioridades del último mes — sacalas de la transcripción Y de los archivos de contexto si son recientes}." Si corresponde cerrá con "Atención: {riesgo u oportunidad que habría que mirar — priorizá lo que surja de los archivos de contexto o la última reunión}." Omití cualquier cláusula cuyo dato no esté disponible — no inventes.

**Estado de la cuenta**
ESTRATÉGICO, NO operativo. Una oración tipo: "Cuenta en estado {verde|amarillo|rojo} porque {razón estratégica — ej. consolidando relación de largo plazo, evaluando renovación, en período de prueba, en escala, en optimización, en recuperación de confianza, etc.}." Luego: "Le interesa principalmente {X — el objetivo de negocio, no el tactic}." Luego: "{Nombre del interlocutor del lado del cliente} se lo nota {bien|mal|confiado|preocupado|etc. — inferido de cómo habla}." Cerrá con "Próximos pasos: {acciones de alto nivel — qué tipo de movimiento toca, no qué métrica subir}."

REGLAS DURAS:
- NO menciones métricas operativas (CTR, CPC, CPM, CVR, ROAS puntual, % específicos de variación) salvo que sean la PALANCA estratégica del momento.
- Sí podés mencionar el momento estratégico ("la cuenta está en escala", "en prueba de concepto", "en riesgo de churn", "candidata a upsell").
- NADA de "subió X%" / "bajó Y%" — eso vive en el módulo de Paid Media, no acá.
- Elegí al interlocutor desde la lista de participantes frecuentes (no de la agencia). Si no estás seguro, omití el nombre y decí "el interlocutor".

Prosa, NO bullets, NO fechas específicas. Máximo 180 palabras la sección "accountSituation" completa.

Respondé SOLO con JSON válido (strings con \\n para saltos de línea):
{"meetingSummary": "...", "accountSituation": "..."}`,
      },
    ],
  });

  await logLlmUsage({
    workspaceId: opts.workspaceId,
    accountId: opts.accountId,
    taskName: "account-summary",
    model: SUMMARY_MODEL,
    usage: response.usage,
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return SummarySchema.parse(JSON.parse(jsonMatch[0]));
  } catch {
    return { meetingSummary: text, accountSituation: text };
  }
}
