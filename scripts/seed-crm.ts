// scripts/seed-crm.ts
// Idempotent seed for CRM module. Inserts a fake "seed-test" connection
// with deterministic external_company_id so rerunning replaces data.
// Usage: npx tsx scripts/seed-crm.ts [accountId]
//   - If accountId is omitted, uses the first account found in the DB.

import { and, eq } from "drizzle-orm";
import { db } from "../lib/drizzle/db";
import {
  accounts,
  crmConnections,
  crmPipelines,
  crmStages,
  crmSources,
  crmSourceConfig,
  crmDeals,
} from "../lib/drizzle/schema";

const SEED_COMPANY_ID = "seed-test-company";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400_000);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const accountIdArg = process.argv[2];

  let targetAccount: { id: string; workspaceId: string; name: string } | null = null;
  if (accountIdArg) {
    const [row] = await db
      .select({ id: accounts.id, workspaceId: accounts.workspaceId, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, accountIdArg))
      .limit(1);
    if (!row) throw new Error(`Account ${accountIdArg} not found`);
    targetAccount = row;
  } else {
    const [row] = await db
      .select({ id: accounts.id, workspaceId: accounts.workspaceId, name: accounts.name })
      .from(accounts)
      .limit(1);
    if (!row) throw new Error("No accounts in DB. Create one first in /app/accounts/new.");
    targetAccount = row;
  }

  console.log(`Target account: ${targetAccount.name} (${targetAccount.id})`);

  // Idempotency: wipe any existing seed connection for this account
  const existing = await db
    .select({ id: crmConnections.id })
    .from(crmConnections)
    .where(
      and(
        eq(crmConnections.accountId, targetAccount.id),
        eq(crmConnections.externalCompanyId, SEED_COMPANY_ID)
      )
    );
  for (const c of existing) {
    await db.delete(crmConnections).where(eq(crmConnections.id, c.id));
    console.log(`Removed existing seed connection ${c.id}`);
  }

  // 1. Connection
  const [conn] = await db
    .insert(crmConnections)
    .values({
      workspaceId: targetAccount.workspaceId,
      accountId: targetAccount.id,
      provider: "pipedrive",
      externalUserId: "seed-user-1",
      externalCompanyId: SEED_COMPANY_ID,
      externalCompanyDomain: "seed-test.pipedrive.com",
      accessToken: "seed-fake-access-token",
      refreshToken: "seed-fake-refresh-token",
      tokenExpiresAt: new Date(Date.now() + 30 * 86400_000),
      status: "active",
      scope: "deals:read deals:full users:read",
      catalogsLastRefresh: new Date(),
      catalogsConfiguredAt: new Date(),
      lastSyncedAt: new Date(Date.now() - 30 * 60_000),
    })
    .returning();
  console.log(`Created connection ${conn.id}`);

  // 2. Pipelines + Stages
  const pipelinesDef = [
    {
      name: "Nuevos Clientes",
      externalId: "seed-pipeline-1",
      stages: [
        { name: "Prospección", proposal: false },
        { name: "Primer contacto", proposal: false },
        { name: "Propuesta enviada", proposal: true },
        { name: "Negociación", proposal: false },
        { name: "Cierre", proposal: false },
      ],
    },
    {
      name: "Upsell Clientes Actuales",
      externalId: "seed-pipeline-2",
      stages: [
        { name: "Identificar oportunidad", proposal: false },
        { name: "Presentación", proposal: false },
        { name: "Propuesta comercial", proposal: true },
        { name: "Cierre", proposal: false },
      ],
    },
  ];

  const allStages: { id: string; pipelineName: string; name: string; orderNr: number }[] = [];

  for (const p of pipelinesDef) {
    const [pipelineRow] = await db
      .insert(crmPipelines)
      .values({
        connectionId: conn.id,
        externalId: p.externalId,
        name: p.name,
        isSynced: true,
      })
      .returning();
    console.log(`  pipeline ${pipelineRow.name}`);

    for (let i = 0; i < p.stages.length; i++) {
      const s = p.stages[i];
      const [stageRow] = await db
        .insert(crmStages)
        .values({
          pipelineId: pipelineRow.id,
          externalId: `${p.externalId}-stage-${i + 1}`,
          name: s.name,
          orderNr: i + 1,
          isSynced: true,
          isProposalStage: s.proposal,
        })
        .returning();
      allStages.push({
        id: stageRow.id,
        pipelineName: pipelineRow.name,
        name: s.name,
        orderNr: i + 1,
      });
    }
  }

  // 3. Sources
  const sourcesDef = [
    { externalId: "instagram", name: "Instagram" },
    { externalId: "google", name: "Google Ads" },
    { externalId: "referido", name: "Referido" },
    { externalId: "outbound", name: "Cold Outreach" },
  ];
  for (const s of sourcesDef) {
    await db.insert(crmSources).values({
      connectionId: conn.id,
      externalId: s.externalId,
      name: s.name,
    });
  }

  // 4. Source config
  await db.insert(crmSourceConfig).values({
    connectionId: conn.id,
    sourceFieldType: "channel",
    sourceFieldKey: "channel",
  });

  // 5. Deals
  const owners = ["Nicolás Matute", "Maria Lopez", "Juan Perez"];
  const currencies = ["ARS", "ARS", "ARS", "USD"]; // weighted toward ARS
  const dealTitles = [
    "Campaña Q2",
    "Rediseño web",
    "Auditoría funnel",
    "Content strategy",
    "Setup Meta Ads",
    "Consultoría SEO",
    "Branding refresh",
    "Email marketing",
    "Growth audit",
    "Video ads production",
    "Landing page optimization",
    "Performance marketing",
    "Retargeting setup",
    "Analytics implementation",
    "CRO consulting",
  ];

  let wonCount = 0;
  let openCount = 0;
  const totalDeals = 55;

  for (let i = 0; i < totalDeals; i++) {
    const stage = pick(allStages);
    // Distribution: ~30% won, ~70% open
    const isWon = Math.random() < 0.3;
    const addTime = daysAgo(randInt(0, 90));
    let updateTime: Date;
    let wonTime: Date | null = null;
    let status: "open" | "won";

    if (isWon) {
      status = "won";
      wonTime = daysAgo(randInt(0, Math.min(60, Math.floor((Date.now() - addTime.getTime()) / 86400_000))));
      updateTime = wonTime;
      wonCount++;
    } else {
      status = "open";
      // Some recent, some stalled (>14d)
      const stalledChance = Math.random();
      if (stalledChance < 0.25) {
        updateTime = daysAgo(randInt(15, 45));
      } else {
        updateTime = daysAgo(randInt(0, 13));
      }
      openCount++;
    }

    const currency = pick(currencies);
    const valueNum =
      currency === "USD" ? randInt(500, 15000) : randInt(150_000, 3_500_000);

    await db.insert(crmDeals).values({
      connectionId: conn.id,
      accountId: targetAccount.id,
      externalId: `seed-deal-${i + 1}`,
      title: `${pick(dealTitles)} #${i + 1}`,
      value: valueNum.toString(),
      currency,
      status,
      pipelineId: null, // optional
      stageId: stage.id,
      sourceExternalId: pick(sourcesDef).externalId,
      ownerName: pick(owners),
      personName: null,
      orgName: null,
      addTime,
      updateTime,
      wonTime,
      rawData: null,
      lastSyncedAt: new Date(),
    });
  }

  console.log(`\nSeeded ${totalDeals} deals: ${openCount} open, ${wonCount} won`);
  console.log(`\nVisit: /app/accounts/${targetAccount.id}/crm`);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
