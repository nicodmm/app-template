import { db } from "@/lib/drizzle/db";
import { driveConnections } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import type { DriveConnection } from "@/lib/drizzle/schema/drive_connections";

export type { DriveConnection };

/** @deprecated use getVisibleDriveConnections/resolveDriveConnectionForUser */
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

/**
 * Conexiones de Drive visibles para un usuario:
 *  - las personales propias (connectedByUserId == userId)
 *  - todas las del workspace con scope 'workspace' (compartidas)
 *  - si es owner, todas.
 */
export async function getVisibleDriveConnections(
  workspaceId: string,
  userId: string,
  isOwner: boolean
): Promise<DriveConnection[]> {
  const all = await db
    .select()
    .from(driveConnections)
    .where(eq(driveConnections.workspaceId, workspaceId));
  if (isOwner) return all;
  return all.filter(
    (c) => c.connectedByUserId === userId || c.scope === "workspace"
  );
}

/**
 * La conexión que usa un usuario para operaciones por-cuenta (pegar link,
 * bindear carpeta): su personal; si no tiene, una compartida del workspace.
 */
export async function resolveDriveConnectionForUser(
  workspaceId: string,
  userId: string
): Promise<DriveConnection | null> {
  const [personal] = await db
    .select()
    .from(driveConnections)
    .where(
      and(
        eq(driveConnections.workspaceId, workspaceId),
        eq(driveConnections.connectedByUserId, userId),
        eq(driveConnections.scope, "personal")
      )
    )
    .limit(1);
  if (personal) return personal;

  const [shared] = await db
    .select()
    .from(driveConnections)
    .where(
      and(
        eq(driveConnections.workspaceId, workspaceId),
        eq(driveConnections.scope, "workspace")
      )
    )
    .limit(1);
  return shared ?? null;
}

/** Carga una conexión por id (sin chequear permiso — el caller lo hace). */
export async function getDriveConnectionById(
  id: string
): Promise<DriveConnection | null> {
  const [row] = await db
    .select()
    .from(driveConnections)
    .where(eq(driveConnections.id, id))
    .limit(1);
  return row ?? null;
}
