import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import {
  crmConnections,
  crmPipelines,
  crmStages,
  crmSourceConfig,
} from "@/lib/drizzle/schema";

export type CrmConnectionState =
  | { state: "no_connection" }
  | {
      state: "not_configured";
      connection: {
        id: string;
        provider: string;
        externalCompanyDomain: string | null;
        status: "active" | "expired" | "revoked";
      };
    }
  | {
      state: "mapped";
      connection: {
        id: string;
        provider: string;
        externalCompanyDomain: string | null;
        status: "active" | "expired" | "revoked";
        lastSyncedAt: Date | null;
      };
    };

export async function getCrmConnectionState(
  workspaceId: string,
  accountId: string
): Promise<CrmConnectionState> {
  const rows = await db
    .select()
    .from(crmConnections)
    .where(
      and(
        eq(crmConnections.workspaceId, workspaceId),
        eq(crmConnections.accountId, accountId)
      )
    )
    .orderBy(desc(crmConnections.createdAt))
    .limit(1);

  if (rows.length === 0) return { state: "no_connection" };
  const c = rows[0];

  if (c.catalogsConfiguredAt === null) {
    return {
      state: "not_configured",
      connection: {
        id: c.id,
        provider: c.provider,
        externalCompanyDomain: c.externalCompanyDomain,
        status: c.status as "active" | "expired" | "revoked",
      },
    };
  }
  return {
    state: "mapped",
    connection: {
      id: c.id,
      provider: c.provider,
      externalCompanyDomain: c.externalCompanyDomain,
      status: c.status as "active" | "expired" | "revoked",
      lastSyncedAt: c.lastSyncedAt,
    },
  };
}

export interface MappingPageData {
  pipelines: {
    id: string;
    externalId: string;
    name: string;
    isSynced: boolean;
    stages: { id: string; externalId: string; name: string; orderNr: number; isSynced: boolean }[];
  }[];
  sourceConfig: { sourceFieldType: "channel" | "custom"; sourceFieldKey: string } | null;
}

export async function getMappingPageData(connectionId: string): Promise<MappingPageData> {
  const pipelines = await db
    .select({
      id: crmPipelines.id,
      externalId: crmPipelines.externalId,
      name: crmPipelines.name,
      isSynced: crmPipelines.isSynced,
    })
    .from(crmPipelines)
    .where(eq(crmPipelines.connectionId, connectionId));

  const stages = await db
    .select({
      id: crmStages.id,
      pipelineId: crmStages.pipelineId,
      externalId: crmStages.externalId,
      name: crmStages.name,
      orderNr: crmStages.orderNr,
      isSynced: crmStages.isSynced,
    })
    .from(crmStages);

  const cfg = await db
    .select()
    .from(crmSourceConfig)
    .where(eq(crmSourceConfig.connectionId, connectionId))
    .limit(1);

  return {
    pipelines: pipelines.map((p) => ({
      ...p,
      stages: stages
        .filter((s) => s.pipelineId === p.id)
        .sort((a, b) => a.orderNr - b.orderNr)
        .map((s) => ({
          id: s.id,
          externalId: s.externalId,
          name: s.name,
          orderNr: s.orderNr,
          isSynced: s.isSynced,
        })),
    })),
    sourceConfig: cfg.length > 0
      ? { sourceFieldType: cfg[0].sourceFieldType as "channel" | "custom", sourceFieldKey: cfg[0].sourceFieldKey }
      : null,
  };
}
