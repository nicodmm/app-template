import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { tasks as tasksTable, contextDocuments } from "@/lib/drizzle/schema";

const anthropic = new Anthropic();

const TaskItemSchema = z.object({
  description: z.string(),
  priority: z.number().int().min(1).max(5).default(3),
  sourceExcerpt: z.string().nullable().optional(),
  sourceContext: z.string().nullable().optional(),
});

const ResponseSchema = z.object({
  tasks: z.array(TaskItemSchema),
});

interface AnalyzeContextDocumentInput {
  contextDocumentId: string;
  accountId: string;
  workspaceId: string;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  note: "una nota / mensaje",
  presentation: "una presentación",
  report: "un reporte",
  spreadsheet: "una planilla",
  other: "un archivo de contexto",
};

export const analyzeContextDocument = task({
  id: "analyze-context-document",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 5000, factor: 2 },
  run: async (payload: AnalyzeContextDocumentInput): Promise<{ extracted: number }> => {
    const [doc] = await db
      .select()
      .from(contextDocuments)
      .where(eq(contextDocuments.id, payload.contextDocumentId))
      .limit(1);

    if (!doc) {
      logger.warn("Context document no longer exists — skipping analyze", {
        contextDocumentId: payload.contextDocumentId,
      });
      return { extracted: 0 };
    }

    // Build the body Claude analyzes: prefer extracted text + user notes, fall
    // back to notes alone for link-only / metadata-only docs. If we have
    // nothing substantive, skip without hitting the API.
    const segments: string[] = [];
    if (doc.notes) segments.push(`Notas del equipo: ${doc.notes}`);
    if (doc.extractedText) segments.push(doc.extractedText);
    const body = segments.join("\n\n").trim();

    if (body.length < 80) {
      logger.info("Context document has too little text to analyze — skipping", {
        contextDocumentId: payload.contextDocumentId,
        bodyLength: body.length,
      });
      return { extracted: 0 };
    }

    const docTypeLabel = DOC_TYPE_LABEL[doc.docType] ?? "un archivo de contexto";

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Analizá ${docTypeLabel} cargado por el equipo y extraé tareas, compromisos y próximos pasos accionables que mencione.

REGLAS:
- Solo extraé tareas si el documento las menciona explícitamente. NO inventes tareas a partir de datos sueltos (filas de planillas, métricas en una presentación) que no representen acciones a tomar.
- Si el documento es una planilla numérica sin contexto narrativo, devolvé tasks: [].
- La transcripción puede tener errores de reconocimiento de voz: usá los términos correctos en tu salida (ej. "colemail" → "cold email").

Para cada tarea devolvé:
- description: descripción clara y accionable (qué hay que hacer)
- priority: 1 (crítica) a 5 (baja)
- sourceExcerpt: cita textual corta (10-30 palabras) del archivo de donde sale la tarea
- sourceContext: 1 oración con contexto (quién la tiene a cargo, plazo si aparece, por qué)

Respondé ÚNICAMENTE con JSON válido:
{"tasks": [{"description": "...", "priority": 1-5, "sourceExcerpt": "...", "sourceContext": "..."}]}

Si no hay tareas claras: {"tasks": []}

ARCHIVO: ${doc.title}
TIPO: ${doc.docType}

CONTENIDO:
${body.substring(0, 12000)}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: z.infer<typeof ResponseSchema>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new AbortTaskRunError("No JSON in response");
      parsed = ResponseSchema.parse(JSON.parse(jsonMatch[0]));
    } catch (err) {
      logger.error("Failed to parse analyze-context-document response", {
        error: err instanceof Error ? err.message : "unknown",
      });
      return { extracted: 0 };
    }

    // Replace any previous AI extractions for this document so re-analysis
    // doesn't duplicate rows on retries.
    await db
      .delete(tasksTable)
      .where(
        and(
          eq(tasksTable.contextDocumentId, payload.contextDocumentId),
          eq(tasksTable.source, "ai_extracted")
        )
      );

    if (parsed.tasks.length > 0) {
      await db.insert(tasksTable).values(
        parsed.tasks.map((t) => ({
          accountId: payload.accountId,
          workspaceId: payload.workspaceId,
          contextDocumentId: payload.contextDocumentId,
          description: t.description,
          priority: t.priority,
          status: "pending" as const,
          source: "ai_extracted" as const,
          sourceExcerpt: t.sourceExcerpt || null,
          sourceContext: t.sourceContext || null,
        }))
      );
    }

    logger.info("Context document analyzed", {
      contextDocumentId: payload.contextDocumentId,
      extracted: parsed.tasks.length,
    });

    return { extracted: parsed.tasks.length };
  },
});
