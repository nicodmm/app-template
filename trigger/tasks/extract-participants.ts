import { task, metadata } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/drizzle/db";
import { participants, transcripts } from "@/lib/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { logLlmUsage } from "@/lib/ai/log-usage";

const MODEL = "claude-haiku-4-5-20251001";
const client = new Anthropic();

const ParticipantSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  role: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

const ParticipantsSchema = z.object({
  participants: z.array(ParticipantSchema),
});

interface ExtractParticipantsInput {
  transcriptId: string;
  accountId: string;
  workspaceId: string;
  cleanedContent: string;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CONFIDENCE_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };

export const extractParticipants = task({
  id: "extract-participants",
  retry: { maxAttempts: 2 },
  run: async (payload: ExtractParticipantsInput): Promise<void> => {
    // Guard: skip if transcript no longer exists
    const exists = await db
      .select({ id: transcripts.id })
      .from(transcripts)
      .where(eq(transcripts.id, payload.transcriptId))
      .limit(1);
    if (exists.length === 0) return;

    await metadata.root.set("progress", 20);
    await metadata.root.set("currentStep", "Identificando participantes...");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analizá la siguiente transcripción e identificá a todos los participantes de la reunión.
Para cada persona detectá: nombre completo, email (si aparece), cargo/rol (si aparece) y nivel de confianza en la detección.
No inventes emails ni roles si no están en el texto.

Respondé ÚNICAMENTE con un JSON válido con esta estructura:
{"participants": [{"name": "...", "email": "...", "role": "...", "confidence": "high|medium|low"}]}

Si no podés identificar participantes, respondé: {"participants": []}

TRANSCRIPCIÓN:
${payload.cleanedContent.substring(0, 8000)}`,
        },
      ],
    });

    await logLlmUsage({
      workspaceId: payload.workspaceId,
      accountId: payload.accountId,
      taskName: "extract-participants",
      model: MODEL,
      usage: response.usage,
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: z.infer<typeof ParticipantsSchema>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = ParticipantsSchema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      // Participants are optional — don't abort the workflow
      await metadata.root.set("progress", 25);
      return;
    }

    // Load existing participants for this account so we can dedupe by email or normalized name
    const existing = await db
      .select()
      .from(participants)
      .where(eq(participants.accountId, payload.accountId));

    const byEmail = new Map<string, typeof existing[number]>();
    const byName = new Map<string, typeof existing[number]>();
    for (const p of existing) {
      if (p.email) byEmail.set(p.email.toLowerCase(), p);
      byName.set(normalizeName(p.name), p);
    }

    const now = new Date();

    for (const extracted of parsed.participants) {
      const emailKey = extracted.email?.toLowerCase();
      const nameKey = normalizeName(extracted.name);

      const match =
        (emailKey && byEmail.get(emailKey)) || byName.get(nameKey) || null;

      if (match) {
        // Update: bump counter, update last seen, fill missing fields, upgrade confidence if higher
        const newConfidence =
          (CONFIDENCE_RANK[extracted.confidence] ?? 2) >
          (CONFIDENCE_RANK[match.confidence] ?? 2)
            ? extracted.confidence
            : match.confidence;

        await db
          .update(participants)
          .set({
            name: match.name || extracted.name,
            email: match.email ?? (extracted.email || null),
            role: match.role ?? (extracted.role || null),
            confidence: newConfidence,
            lastTranscriptId: payload.transcriptId,
            lastSeenAt: now,
            appearanceCount: sql`${participants.appearanceCount} + 1`,
            updatedAt: now,
          })
          .where(eq(participants.id, match.id));
      } else {
        await db.insert(participants).values({
          accountId: payload.accountId,
          workspaceId: payload.workspaceId,
          firstTranscriptId: payload.transcriptId,
          lastTranscriptId: payload.transcriptId,
          name: extracted.name,
          email: extracted.email || null,
          role: extracted.role || null,
          confidence: extracted.confidence,
          appearanceCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      }
    }

    await metadata.root.set("progress", 25);
    await metadata.root.set(
      "currentStep",
      `${parsed.participants.length} participantes identificados`
    );
  },
});
