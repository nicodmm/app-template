import { db } from "@/lib/drizzle/db";
import {
  accountShareLinks,
  accounts,
  transcripts,
  contextDocuments,
  tasks,
  participants,
  signals,
  accountHealthHistory,
  metaCampaigns,
  metaAds,
  metaInsightsDaily,
  metaAdAccounts,
  crmDeals,
  crmStages,
  crmPipelines,
  workspaces,
  users,
} from "@/lib/drizzle/schema";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { coerceShareConfig, type ShareConfig } from "@/lib/share/share-config";

export interface PublicAccountSnapshot {
  share: {
    token: string;
    requiresPassword: boolean;
    passwordVersion: number;
    isActive: boolean;
  };
  workspace: {
    name: string;
    logoUrl: string | null;
  };
  account: {
    id: string;
    name: string;
    industry: string | null;
    ownerName: string | null;
    lastActivityAt: Date | null;
  };
  config: ShareConfig;
  data: {
    summary: { clientSummary: string | null } | null;
    context: {
      goals: string | null;
      startDate: string | null;
      serviceScope: string | null;
      industry: string | null;
      location: string | null;
      companyDescription: string | null;
      websiteUrl: string | null;
      linkedinUrl: string | null;
    } | null;
    lastMeeting: {
      title: string;
      meetingDate: Date | null;
      meetingSummary: string | null;
    } | null;
    files: Array<{
      title: string;
      docType: string;
      createdAt: Date;
    }> | null;
    tasks: Array<{
      description: string;
      status: string;
    }> | null;
    participants: Array<{
      name: string;
      role: string | null;
    }> | null;
    signals: Array<{
      type: string;
      description: string | null;
      createdAt: Date;
    }> | null;
    crm: {
      pipeline: string | null;
      stage: string | null;
    } | null;
    health: Array<{
      createdAt: Date;
      healthSignal: string;
    }> | null;
    paidMedia: {
      campaigns: Array<{
        id: string;
        name: string;
        status: string;
      }>;
      ads: Array<{
        id: string;
        campaignId: string;
        name: string;
        status: string;
        thumbnailUrl: string | null;
      }>;
      kpis: {
        spend: number;
        impressions: number;
        clicks: number;
      };
    } | null;
  };
}

export interface SnapshotLookupResult {
  status: "ok" | "not_found" | "inactive" | "password_required";
  snapshot?: PublicAccountSnapshot;
  shareLinkId?: string;
  passwordHash?: string;
  passwordVersion?: number;
}

/**
 * Look up the share link by token and load the redacted snapshot.
 * Caller is responsible for separately checking the cookie/password before
 * acting on `password_required`.
 */
export async function getPublicAccountSnapshot(
  token: string
): Promise<SnapshotLookupResult> {
  const [link] = await db
    .select()
    .from(accountShareLinks)
    .where(eq(accountShareLinks.token, token))
    .limit(1);

  if (!link) return { status: "not_found" };
  if (!link.isActive) return { status: "inactive" };

  const [accountRow] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      goals: accounts.goals,
      startDate: accounts.startDate,
      serviceScope: accounts.serviceScope,
      industry: accounts.industry,
      location: accounts.location,
      companyDescription: accounts.companyDescription,
      websiteUrl: accounts.websiteUrl,
      linkedinUrl: accounts.linkedinUrl,
      clientSummary: accounts.clientSummary,
      lastActivityAt: accounts.lastActivityAt,
      ownerId: accounts.ownerId,
      workspaceId: accounts.workspaceId,
    })
    .from(accounts)
    .where(eq(accounts.id, link.accountId))
    .limit(1);

  if (!accountRow) return { status: "not_found" };

  const [workspaceRow] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, accountRow.workspaceId))
    .limit(1);

  let ownerName: string | null = null;
  if (accountRow.ownerId) {
    const [u] = await db
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, accountRow.ownerId))
      .limit(1);
    ownerName = u?.fullName ?? u?.email ?? null;
  }

  const config = coerceShareConfig(link.shareConfig);

  const [
    lastMeetingData,
    filesData,
    tasksData,
    participantsData,
    signalsData,
    crmData,
    healthData,
    paidMediaData,
  ] = await Promise.all([
    config.lastMeeting
      ? db
          .select({
            fileName: transcripts.fileName,
            meetingDate: transcripts.meetingDate,
            meetingSummary: transcripts.meetingSummary,
            createdAt: transcripts.createdAt,
          })
          .from(transcripts)
          .where(eq(transcripts.accountId, accountRow.id))
          .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt))
          .limit(1)
          .then((rows) => {
            const r = rows[0];
            if (!r) return null;
            return {
              title: r.fileName ?? "Reunión",
              meetingDate: r.meetingDate ? new Date(r.meetingDate) : null,
              meetingSummary: r.meetingSummary,
            };
          })
      : Promise.resolve(null),
    config.files
      ? db
          .select({
            title: contextDocuments.title,
            docType: contextDocuments.docType,
            createdAt: contextDocuments.createdAt,
          })
          .from(contextDocuments)
          .where(eq(contextDocuments.accountId, accountRow.id))
          .orderBy(desc(contextDocuments.createdAt))
          .limit(20)
      : Promise.resolve(null),
    config.tasks
      ? db
          .select({
            description: tasks.description,
            status: tasks.status,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.accountId, accountRow.id),
              inArray(tasks.status, ["pending", "in_progress"])
            )
          )
          .orderBy(desc(tasks.createdAt))
          .limit(20)
      : Promise.resolve(null),
    config.participants
      ? db
          .select({ name: participants.name, role: participants.role })
          .from(participants)
          .where(eq(participants.accountId, accountRow.id))
          .orderBy(desc(participants.appearanceCount))
          .limit(20)
      : Promise.resolve(null),
    config.signals
      ? db
          .select({
            type: signals.type,
            description: signals.description,
            createdAt: signals.createdAt,
          })
          .from(signals)
          .where(
            and(
              eq(signals.accountId, accountRow.id),
              eq(signals.status, "active"),
              inArray(signals.type, [
                "upsell_opportunity",
                "growth_opportunity",
              ])
            )
          )
          .orderBy(desc(signals.createdAt))
          .limit(20)
      : Promise.resolve(null),
    config.crm ? loadCrmForAccount(accountRow.id) : Promise.resolve(null),
    config.health
      ? db
          .select({
            createdAt: accountHealthHistory.createdAt,
            healthSignal: accountHealthHistory.healthSignal,
          })
          .from(accountHealthHistory)
          .where(eq(accountHealthHistory.accountId, accountRow.id))
          .orderBy(desc(accountHealthHistory.createdAt))
          .limit(12)
      : Promise.resolve(null),
    config.paidMedia
      ? loadPaidMediaForAccount(accountRow.id)
      : Promise.resolve(null),
  ]);

  // Best-effort view tracking (non-awaited, ignore failures).
  void db
    .update(accountShareLinks)
    .set({
      viewCount: link.viewCount + 1,
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(accountShareLinks.id, link.id))
    .catch(() => {});

  const snapshot: PublicAccountSnapshot = {
    share: {
      token: link.token,
      requiresPassword: !!link.passwordHash,
      passwordVersion: link.passwordVersion,
      isActive: link.isActive,
    },
    workspace: {
      name: workspaceRow?.name ?? "",
      logoUrl: null,
    },
    account: {
      id: accountRow.id,
      name: accountRow.name,
      industry: accountRow.industry,
      ownerName,
      lastActivityAt: accountRow.lastActivityAt,
    },
    config,
    data: {
      summary: config.summary
        ? { clientSummary: accountRow.clientSummary }
        : null,
      context: config.context
        ? {
            goals: accountRow.goals,
            startDate: accountRow.startDate,
            serviceScope: accountRow.serviceScope,
            industry: accountRow.industry,
            location: accountRow.location,
            companyDescription: accountRow.companyDescription,
            websiteUrl: accountRow.websiteUrl,
            linkedinUrl: accountRow.linkedinUrl,
          }
        : null,
      lastMeeting: lastMeetingData,
      files: filesData,
      tasks: tasksData,
      participants: participantsData,
      signals: signalsData,
      crm: crmData,
      health: healthData,
      paidMedia: paidMediaData,
    },
  };

  return {
    status: link.passwordHash ? "password_required" : "ok",
    snapshot,
    shareLinkId: link.id,
    passwordHash: link.passwordHash ?? undefined,
    passwordVersion: link.passwordVersion,
  };
}

async function loadCrmForAccount(accountId: string) {
  const [deal] = await db
    .select({
      pipelineId: crmDeals.pipelineId,
      stageId: crmDeals.stageId,
    })
    .from(crmDeals)
    .where(eq(crmDeals.accountId, accountId))
    .orderBy(desc(crmDeals.updateTime))
    .limit(1);
  if (!deal || !deal.pipelineId || !deal.stageId) {
    return { pipeline: null, stage: null };
  }
  const [stage] = await db
    .select({ name: crmStages.name })
    .from(crmStages)
    .where(eq(crmStages.id, deal.stageId))
    .limit(1);
  const [pipeline] = await db
    .select({ name: crmPipelines.name })
    .from(crmPipelines)
    .where(eq(crmPipelines.id, deal.pipelineId))
    .limit(1);
  return {
    pipeline: pipeline?.name ?? null,
    stage: stage?.name ?? null,
  };
}

async function loadPaidMediaForAccount(accountId: string) {
  const adAccountRows = await db
    .select({ id: metaAdAccounts.id })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.accountId, accountId));
  const adAccountIds = adAccountRows.map((r) => r.id);
  if (adAccountIds.length === 0) {
    return {
      campaigns: [],
      ads: [],
      kpis: { spend: 0, impressions: 0, clicks: 0 },
    };
  }

  const [campaigns, ads, insightsRows] = await Promise.all([
    db
      .select({
        id: metaCampaigns.id,
        name: metaCampaigns.name,
        publicName: metaCampaigns.publicName,
        status: metaCampaigns.status,
      })
      .from(metaCampaigns)
      .where(inArray(metaCampaigns.adAccountId, adAccountIds)),
    db
      .select({
        id: metaAds.id,
        campaignId: metaAds.campaignId,
        name: metaAds.name,
        publicName: metaAds.publicName,
        status: metaAds.status,
        thumbnailUrl: metaAds.thumbnailUrl,
      })
      .from(metaAds)
      .where(inArray(metaAds.adAccountId, adAccountIds)),
    db
      .select({
        spend: metaInsightsDaily.spend,
        impressions: metaInsightsDaily.impressions,
        clicks: metaInsightsDaily.clicks,
      })
      .from(metaInsightsDaily)
      .where(
        and(
          inArray(metaInsightsDaily.adAccountId, adAccountIds),
          gte(
            metaInsightsDaily.date,
            new Date(Date.now() - 30 * 86400_000)
              .toISOString()
              .slice(0, 10)
          )
        )
      ),
  ]);

  const kpis = insightsRows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend ?? 0);
      acc.impressions += Number(r.impressions ?? 0);
      acc.clicks += Number(r.clicks ?? 0);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0 }
  );

  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.publicName ?? c.name,
      status: c.status,
    })),
    ads: ads.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      name: a.publicName ?? a.name,
      status: a.status,
      thumbnailUrl: a.thumbnailUrl,
    })),
    kpis,
  };
}
