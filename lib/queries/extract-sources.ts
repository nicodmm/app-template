import { db } from "@/lib/drizzle/db";
import { transcripts, contextDocuments } from "@/lib/drizzle/schema";
import { eq, desc } from "drizzle-orm";

export interface ExtractTranscriptOption {
  id: string;
  fileName: string | null;
  meetingDate: string | null;
  createdAt: Date;
}

/** Reuniones ya importadas en la cuenta, para re-extraer tareas on-demand. */
export async function listAccountTranscriptsForExtraction(
  accountId: string
): Promise<ExtractTranscriptOption[]> {
  return db
    .select({
      id: transcripts.id,
      fileName: transcripts.fileName,
      meetingDate: transcripts.meetingDate,
      createdAt: transcripts.createdAt,
    })
    .from(transcripts)
    .where(eq(transcripts.accountId, accountId))
    .orderBy(desc(transcripts.createdAt));
}

export interface ExtractContextDocOption {
  id: string;
  title: string;
  docType: string;
  createdAt: Date;
}

/** Documentos de contexto de la cuenta, para extraer tareas on-demand. */
export async function listAccountContextDocsForExtraction(
  accountId: string
): Promise<ExtractContextDocOption[]> {
  return db
    .select({
      id: contextDocuments.id,
      title: contextDocuments.title,
      docType: contextDocuments.docType,
      createdAt: contextDocuments.createdAt,
    })
    .from(contextDocuments)
    .where(eq(contextDocuments.accountId, accountId))
    .orderBy(desc(contextDocuments.createdAt));
}
