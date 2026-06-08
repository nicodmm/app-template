import { task, metadata, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { tasks, transcripts, taskMeetingMentions } from "@/lib/drizzle/schema";
import { eq, and, inArray, ne, desc, isNull, sql } from "drizzle-orm";
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

const MatchSchema = z.object({
  matches: z.array(
    z.object({
      candidate: z.number().int(),
      existingId: z.string().nullable(),
    })
  ),
});

interface ExtractTasksInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  cleanedContent: string;
}

/** Extrae el primer bloque JSON `{...}` de una respuesta del modelo. */
function extractJson(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
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

    // ── 1. Extracción de candidatas (igual que antes) ───────────────────────
    const response = await client.messages.create({
      model: MODEL,
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

    await logLlmUsage({
      workspaceId: payload.workspaceId,
      accountId: payload.accountId,
      taskName: "extract-tasks",
      model: MODEL,
      usage: response.usage,
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: z.infer<typeof TasksSchema>;
    try {
      const json = extractJson(text);
      if (!json) throw new AbortTaskRunError("No se pudo parsear la respuesta de tareas");
      parsed = TasksSchema.parse(JSON.parse(json));
    } catch (err) {
      if (err instanceof AbortTaskRunError) throw err;
      throw new AbortTaskRunError("Respuesta de tareas con formato inválido");
    }

    // ── 2. Idempotencia (reintentos) ────────────────────────────────────────
    // Tareas creadas en `auto` por ESTE transcript, sin edición humana.
    const autoCreatedByThis = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.transcriptId, payload.transcriptId),
          eq(tasks.source, "ai_extracted"),
          eq(tasks.status, "auto"),
          sql`${tasks.createdAt} = ${tasks.updatedAt}`
        )
      );
    // Borrar las menciones de este transcript.
    await db
      .delete(taskMeetingMentions)
      .where(eq(taskMeetingMentions.transcriptId, payload.transcriptId));
    // Borrar las tareas auto-creadas por este transcript que ya no tengan
    // ninguna mención de otro transcript (su único origen era esta corrida).
    if (autoCreatedByThis.length > 0) {
      const ids = autoCreatedByThis.map((t) => t.id);
      const stillMentioned = await db
        .select({ taskId: taskMeetingMentions.taskId })
        .from(taskMeetingMentions)
        .where(inArray(taskMeetingMentions.taskId, ids));
      const keep = new Set(stillMentioned.map((r) => r.taskId));
      const orphans = ids.filter((id) => !keep.has(id));
      if (orphans.length > 0) {
        await db.delete(tasks).where(inArray(tasks.id, orphans));
      }
    }

    // ── 3. Tareas existentes de la cuenta (para matching + completadas) ──────
    // Activas (no terminadas), top-level, las más recientes primero.
    const existing = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.accountId, payload.accountId),
          ne(tasks.status, "listas"),
          ne(tasks.status, "completed"),
          isNull(tasks.parentTaskId)
        )
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(60);

    const existingIds = new Set(existing.map((t) => t.id));

    // ── 4. Pasada de matching (dedup semántico) ─────────────────────────────
    // candidato index → existingId (o null = tarea nueva)
    const matchByCandidate = new Map<number, string | null>();

    if (parsed.tasks.length > 0 && existing.length > 0) {
      const matchResponse = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Tenés tareas YA EXISTENTES de una cuenta y tareas CANDIDATAS recién extraídas de una reunión. Para cada candidata decidí si se refiere a la MISMA tarea concreta que alguna existente (aunque esté redactada distinto). Sé estricto: solo es match si es claramente el mismo trabajo, no si solo comparten tema.

EXISTENTES:
${existing.map((t) => `[${t.id}] ${t.title || t.description}`).join("\n")}

CANDIDATAS:
${parsed.tasks.map((t, i) => `[${i}] ${t.description}`).join("\n")}

Respondé ÚNICAMENTE con JSON válido. Incluí una entrada por cada candidata:
{"matches": [{"candidate": 0, "existingId": "uuid-de-la-existente-o-null"}]}`,
          },
        ],
      });

      await logLlmUsage({
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        taskName: "extract-tasks-match",
        model: MODEL,
        usage: matchResponse.usage,
      });

      const matchText =
        matchResponse.content[0]?.type === "text" ? matchResponse.content[0].text : "";
      try {
        const json = extractJson(matchText);
        if (json) {
          const { matches } = MatchSchema.parse(JSON.parse(json));
          for (const m of matches) {
            const valid = m.existingId && existingIds.has(m.existingId) ? m.existingId : null;
            matchByCandidate.set(m.candidate, valid);
          }
        }
      } catch {
        // Matching best-effort: si falla, todas las candidatas se tratan como nuevas.
      }
    }

    // ── 5. Aplicar: mención a existente, o crear nueva en `auto` ─────────────
    for (let i = 0; i < parsed.tasks.length; i++) {
      const candidate = parsed.tasks[i];
      const matchedId = matchByCandidate.get(i) ?? null;

      if (matchedId) {
        // Ya existe: no duplicar, registrar la mención.
        await db.insert(taskMeetingMentions).values({
          taskId: matchedId,
          transcriptId: payload.transcriptId,
          sourceExcerpt: candidate.sourceExcerpt || null,
          sourceContext: candidate.sourceContext || null,
        });
      } else {
        // Nueva: crear en `auto` + su primera mención.
        const [created] = await db
          .insert(tasks)
          .values({
            accountId: payload.accountId,
            workspaceId: payload.workspaceId,
            transcriptId: payload.transcriptId,
            description: candidate.description,
            priority: candidate.priority,
            status: "auto",
            source: "ai_extracted",
            sourceExcerpt: candidate.sourceExcerpt || null,
            sourceContext: candidate.sourceContext || null,
          })
          .returning({ id: tasks.id });
        await db.insert(taskMeetingMentions).values({
          taskId: created.id,
          transcriptId: payload.transcriptId,
          sourceExcerpt: candidate.sourceExcerpt || null,
          sourceContext: candidate.sourceContext || null,
        });
      }
    }

    // ── 6. Detección de completadas → mover a `listas` ──────────────────────
    // Se evalúa sobre las tareas pre-existentes (no las recién creadas).
    const candidatesForCompletion = existing.slice(0, 15);
    if (candidatesForCompletion.length > 0) {
      const completionResponse = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `Analizá esta transcripción e identificá cuáles de las siguientes tareas pendientes fueron mencionadas explícitamente como COMPLETADAS, RESUELTAS o ENTREGADAS. Sé conservador: solo marcá las que tengan evidencia clara de haber sido terminadas.

Tareas pendientes:
${candidatesForCompletion.map((t) => `[${t.id}] ${t.title || t.description}`).join("\n")}

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
        const json = extractJson(completionText);
        if (json) {
          const { completed } = JSON.parse(json) as { completed: string[] };
          const validIds = completed.filter((id) =>
            candidatesForCompletion.some((t) => t.id === id)
          );
          if (validIds.length > 0) {
            await db
              .update(tasks)
              .set({ status: "listas", completedAt: new Date(), updatedAt: new Date() })
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
    await metadata.root.set("currentStep", `${parsed.tasks.length} tareas procesadas`);
  },
});
