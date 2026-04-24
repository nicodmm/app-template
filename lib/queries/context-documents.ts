import { db } from "@/lib/drizzle/db";
import { contextDocuments } from "@/lib/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import type { ContextDocument } from "@/lib/drizzle/schema/context_documents";

export type { ContextDocument };

export async function getAccountContextDocuments(
  accountId: string,
  limit = 50
): Promise<ContextDocument[]> {
  return db
    .select()
    .from(contextDocuments)
    .where(eq(contextDocuments.accountId, accountId))
    .orderBy(desc(contextDocuments.createdAt))
    .limit(limit);
}
