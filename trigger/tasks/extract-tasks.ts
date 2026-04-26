import { task, metadata, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { tasks, transcripts } from "@/lib/drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logLlmUsage } from "@/lib/ai/log-usage";

const MODEL = "claude-haiku-4-5-20251001";
const client = new Anthropic();

const TaskItemSchema = z.object({
  description: z.string(),
  priority: z.number().int().min(1).max(5).default(3),
  sourceExcerpt: z.string().nullable().optional(),
  sourceContext: z.string().nullable().optional(),
});

const TasksSchema = z.object({
  tasks: z.array(TaskItemSchema),
});

interface ExtractTasksInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  cleanedContent: string;
}

export const extractTasks = task({
  id: "extract-tasks",
  retry: { maxAttempts: 2 },
  run: async (payload: ExtractTasksInput): Promise<void> => {
    // Guard: skip if transcript no longer exists (e.g. stale run from expired batch)
    const exists = await db
      .select({ id: transcripts.id })
      .from(transcripts)
      .where(eq(transcripts.id, payload.transcriptId))
      .limit(1);
    if (exists.length === 0) return;

    await metadata.root.set("progress", 40);
    await metadata.root.set("currentStep", "Extrayendo tareas...");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Analizá la siguiente transcripción de reunión y extraé todas las tareas, compromisos y próximos pasos mencionados.

Para cada tarea devolvé:
- description: descripción clara y accionable (qué hay que hacer)
- priority: 1 (crítica) a 5 (baja)
- sourceExcerpt: cita textual (20-40 palabras) de la transcripción donde se origina la tarea, conservando las palabras exactas
- sourceContext: 1 oración corta con el contexto: quién lo pidió o asumió, a quién se lo asignó, plazo si se mencionó, y por qué (ej: "Juan se comprometió a enviarlo antes del viernes porque el cliente lo pidió en la reunión anterior")

Respondé ÚNICAMENTE con un JSON válido:
{"tasks": [{"description": "...", "priority": 1-5, "sourceExcerpt": "...", "sourceContext": "..."}]}

Si no hay tareas claras, respondé: {"tasks": []}

TRANSCRIPCIÓN:
${payload.cleanedContent.substring(0, 12000)}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: z.infer<typeof TasksSchema>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new AbortTaskRunError("No se pudo parsear la respuesta de tareas");
      parsed = TasksSchema.parse(JSON.parse(jsonMatch[0]));
    } catch (err) {
      if (err instanceof AbortTaskRunError) throw err;
      throw new AbortTaskRunError("Respuesta de tareas con formato inválido");
    }

    // Clear previous extractions for this transcript before inserting (handles retries)
    await db.delete(tasks).where(
      and(eq(tasks.transcriptId, payload.transcriptId), eq(tasks.source, "ai_extracted"))
    );

    if (parsed.tasks.length > 0) {
      await db.insert(tasks).values(
        parsed.tasks.map((t) => ({
          accountId: payload.accountId,
          workspaceId: payload.workspaceId,
          transcriptId: payload.transcriptId,
          description: t.description,
          priority: t.priority,
          status: "pending" as const,
          source: "ai_extracted" as const,
          sourceExcerpt: t.sourceExcerpt || null,
          sourceContext: t.sourceContext || null,
        }))
      );
    }

    // Detect which existing pending tasks were completed in this meeting
    const allPending = await db
      .select({ id: tasks.id, description: tasks.description })
      .from(tasks)
      .where(
        and(
          eq(tasks.accountId, payload.accountId),
          eq(tasks.status, "pending")
        )
      )
      .limit(15);

    if (allPending.length > 0) {
      const completionResponse = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `Analizá esta transcripción e identificá cuáles de las siguientes tareas pendientes fueron mencionadas explícitamente como COMPLETADAS, RESUELTAS o ENTREGADAS. Sé conservador: solo marcá las que tengan evidencia clara de haber sido terminadas.

Tareas pendientes:
${allPending.map((t) => `[${t.id}] ${t.description}`).join("\n")}

Respondé ÚNICAMENTE con JSON válido: {"completed": ["uuid1", "uuid2"]}
Si ninguna fue completada: {"completed": []}

TRANSCRIPCIÓN:
${payload.cleanedContent.substring(0, 8000)}`,
          },
        ],
      });

      await logLlmUsage({
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        taskName: "extract-tasks-completion",
        model: MODEL,
        usage: completionResponse.usage,
      });

      const completionText =
        completionResponse.content[0]?.type === "text"
          ? completionResponse.content[0].text
          : "";

      try {
        const jsonMatch = completionText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const { completed } = JSON.parse(jsonMatch[0]) as { completed: string[] };
          const validIds = completed.filter((id) =>
            allPending.some((t) => t.id === id)
          );
          if (validIds.length > 0) {
            await db
              .update(tasks)
              .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
              .where(
                and(
                  eq(tasks.accountId, payload.accountId),
                  inArray(tasks.id, validIds)
                )
              );
          }
        }
      } catch {
        // Silently ignore — task completion detection is best-effort
      }
    }

    await metadata.root.set("progress", 50);
    await metadata.root.set("currentStep", `${parsed.tasks.length} tareas extraídas`);
  },
});
