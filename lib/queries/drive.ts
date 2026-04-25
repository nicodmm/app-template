import { db } from "@/lib/drizzle/db";
import { driveConnections } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import type { DriveConnection } from "@/lib/drizzle/schema/drive_connections";

export type { DriveConnection };

export async function getDriveConnectionForWorkspace(
  workspaceId: string
): Promise<DriveConnection | null> {
  const result = await db
    .select()
    .from(driveConnections)
    .where(eq(driveConnections.workspaceId, workspaceId))
    .limit(1);
  return result[0] ?? null;
}
