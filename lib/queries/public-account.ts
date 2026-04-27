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
  workspaceMembers,
  users,
} from "@/lib/drizzle/schema";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { coerceShareConfig, type ShareConfig } from "@/lib/share/share-config";

/**
 * Strip markdown sections that are explicitly internal-facing. The summary
 * pipeline emits sections like "**Riesgos:**" or "**Atención:**" that the
 * client should never see — we cut them out before rendering. We also drop
 * any "Atención: ..." inline sentences in the accountSituation prose.
 */
function redactInternalSections(text: string | null): string | null {
  if (!text) return text;
  // Drop sections that start with one of the internal headers and run until
  // the next bold header or end of string.
  const sectionHeaders = [
    "Riesgos",
    "Riesgo",
    "Atención",
    "Atencion",
    "Health",
    "Salud",
    "Justificación",
    "Justificacion",
  ];
  let out = text;
  for (const h of sectionHeaders) {
    const re = new RegExp(
      `\\*\\*\\s*${h}\\s*:?\\s*\\*\\*[\\s\\S]*?(?=(\\n\\n\\*\\*|$))`,
      "gi"
    );
    out = out.replace(re, "");
  }
  // Inline "Atención: ..." sentence form
  out = out.replace(/Atención:[^.\n]*\.?/gi, "");
  out = out.replace(/Atencion:[^.\n]*\.?/gi, "");
  // Collapse triple-blank-line gaps left by the deletion.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

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
      kind: "document" | "meeting";
      docType: string | null;
      meetingDate: Date | null;
      createdAt: Date;
    }> | null;
    tasks: Array<{
      id: string;
      description: string;
      priority: number;
      transcriptId: string | null;
      meetingDate: Date | null;
      meetingTitle: string | null;
      sourceExcerpt: string | null;
      sourceContext: string | null;
      createdAt: Date;
    }> | null;
    participants: Array<{
      name: string;
      role: string | null;
      isAgencyTeam: boolean;
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
      aiSummary: accounts.aiSummary,
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

  // Pre-compute the most recent transcript id so we can exclude it from the
  // "Archivos" timeline (it's already shown as the standalone last-meeting
  // section).
  const [latestTranscript] = config.lastMeeting || config.files
    ? await db
        .select({ id: transcripts.id })
        .from(transcripts)
        .where(eq(transcripts.accountId, accountRow.id))
        .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt))
        .limit(1)
    : [undefined];

  // Workspace member emails — used to relabel participants who match a
  // workspace user as "Equipo de {workspace}".
  const memberEmails = config.participants
    ? new Set(
        (
          await db
            .select({ email: users.email })
            .from(workspaceMembers)
            .innerJoin(users, eq(users.id, workspaceMembers.userId))
            .where(eq(workspaceMembers.workspaceId, accountRow.workspaceId))
        )
          .map((r) => r.email?.toLowerCase().trim())
          .filter((e): e is string => !!e)
      )
    : new Set<string>();

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
              meetingSummary: redactInternalSections(r.meetingSummary),
            };
          })
      : Promise.resolve(null),
    config.files ? loadFilesTimeline(accountRow.id, latestTranscript?.id ?? null) : Promise.resolve(null),
    config.tasks ? loadTasksWithContext(accountRow.id) : Promise.resolve(null),
    config.participants
      ? db
          .select({
            name: participants.name,
            role: participants.role,
            email: participants.email,
          })
          .from(participants)
          .where(eq(participants.accountId, accountRow.id))
          .orderBy(desc(participants.appearanceCount))
          .limit(40)
          .then((rows) =>
            rows.map((p) => {
              const email = p.email?.toLowerCase().trim() ?? null;
              const isAgencyTeam = !!email && memberEmails.has(email);
              return {
                name: p.name,
                role: isAgencyTeam
                  ? `Equipo de ${workspaceRow?.name ?? "tu agencia"}`
                  : p.role,
                isAgencyTeam,
              };
            })
          )
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

  // Summary fallback: when client_summary hasn't been generated yet (older
  // accounts pre-deploy), fall back to a redacted version of aiSummary so
  // the panel isn't empty. Internal-only sections are stripped first.
  const summaryText =
    accountRow.clientSummary ?? redactInternalSections(accountRow.aiSummary);

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
      summary: config.summary ? { clientSummary: summaryText } : null,
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

/**
 * Files timeline: merges context_documents + transcripts (excluding the
 * most recent one which is shown standalone in the "Última reunión"
 * section). Sorted newest-first by createdAt.
 */
async function loadFilesTimeline(
  accountId: string,
  excludeTranscriptId: string | null
) {
  const [docs, trans] = await Promise.all([
    db
      .select({
        title: contextDocuments.title,
        docType: contextDocuments.docType,
        createdAt: contextDocuments.createdAt,
      })
      .from(contextDocuments)
      .where(eq(contextDocuments.accountId, accountId))
      .orderBy(desc(contextDocuments.createdAt))
      .limit(40),
    db
      .select({
        fileName: transcripts.fileName,
        meetingDate: transcripts.meetingDate,
        createdAt: transcripts.createdAt,
        id: transcripts.id,
      })
      .from(transcripts)
      .where(
        excludeTranscriptId
          ? and(
              eq(transcripts.accountId, accountId),
              ne(transcripts.id, excludeTranscriptId)
            )
          : eq(transcripts.accountId, accountId)
      )
      .orderBy(desc(transcripts.meetingDate), desc(transcripts.createdAt))
      .limit(40),
  ]);

  const merged: PublicAccountSnapshot["data"]["files"] = [
    ...docs.map((d) => ({
      title: d.title,
      kind: "document" as const,
      docType: d.docType,
      meetingDate: null,
      createdAt: d.createdAt,
    })),
    ...trans.map((t) => ({
      title: t.fileName ?? "Reunión",
      kind: "meeting" as const,
      docType: null,
      meetingDate: t.meetingDate ? new Date(t.meetingDate) : null,
      createdAt: t.createdAt,
    })),
  ];
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return merged.slice(0, 40);
}

/**
 * Tasks for the public view — pulls the priority + meeting context so the
 * client view can group by reunión and show the same cards as the agency
 * UI (read-only).
 */
async function loadTasksWithContext(accountId: string) {
  const rows = await db
    .select({
      id: tasks.id,
      description: tasks.description,
      priority: tasks.priority,
      transcriptId: tasks.transcriptId,
      sourceExcerpt: tasks.sourceExcerpt,
      sourceContext: tasks.sourceContext,
      createdAt: tasks.createdAt,
      meetingDate: transcripts.meetingDate,
      meetingTitle: transcripts.fileName,
    })
    .from(tasks)
    .leftJoin(transcripts, eq(transcripts.id, tasks.transcriptId))
    .where(
      and(
        eq(tasks.accountId, accountId),
        inArray(tasks.status, ["pending", "in_progress"])
      )
    )
    .orderBy(desc(tasks.createdAt))
    .limit(40);

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    priority: r.priority,
    transcriptId: r.transcriptId,
    meetingDate: r.meetingDate ? new Date(r.meetingDate) : null,
    meetingTitle: r.meetingTitle,
    sourceExcerpt: r.sourceExcerpt,
    sourceContext: r.sourceContext,
    createdAt: r.createdAt,
  }));
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
