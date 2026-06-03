import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requireUserId, getCurrentUserId } from "@/lib/auth";
import {
  getWorkspaceWithMember,
  getWorkspaceMembers,
} from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { db } from "@/lib/drizzle/db";
import { accountFinance, accountConsultants, users } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import {
  getAccountTerms,
  getFinanceMembers,
  getBillingForMonth,
} from "@/lib/queries/finance";
import { runMonthlyBilling } from "@/lib/finance/run-monthly-billing";
import { GlassCard } from "@/components/ui/glass-card";
import { FinanceDocs } from "@/components/finance/finance-docs";
import { TermsEditor } from "@/components/finance/terms-editor";
import { FinanceBillingForm } from "@/components/account-detail/finance-billing-form";
import { FinanceTeam } from "@/components/account-detail/finance-team";
import { AccountBillingPanel } from "@/components/finance/account-billing-panel";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function AccountFinancePage({
  params,
  searchParams,
}: PageProps) {
  await requireUserId();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const result = await getWorkspaceWithMember(userId);
  if (!result) redirect("/auth/login");
  const { workspace, member } = result;

  const canFinance =
    member.financeAdmin === true ||
    member.role === "owner" ||
    member.role === "admin";
  if (!canFinance) redirect("/unauthorized");

  const { accountId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const parsedYear = sp.year ? parseInt(sp.year, 10) : NaN;
  const parsedMonth = sp.month ? parseInt(sp.month, 10) : NaN;
  const year =
    !isNaN(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : now.getFullYear();
  const month =
    !isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : now.getMonth() + 1;

  const account = await getAccountById(accountId, workspace.id, {
    userId,
    role: member.role,
  });
  if (!account) notFound();

  // Auto-generar la facturación del mes visto (idempotente, preserva estados).
  await runMonthlyBilling(workspace.id, year, month);

  const [financeRows, consultantRows, members, terms, financeMembers, allBilling] =
    await Promise.all([
      db
        .select()
        .from(accountFinance)
        .where(eq(accountFinance.accountId, accountId))
        .limit(1),
      db
        .select({
          id: accountConsultants.id,
          userId: accountConsultants.userId,
          neurona: accountConsultants.neurona,
          roleLabel: accountConsultants.roleLabel,
          fullName: users.fullName,
          email: users.email,
        })
        .from(accountConsultants)
        .innerJoin(users, eq(accountConsultants.userId, users.id))
        .where(eq(accountConsultants.accountId, accountId)),
      getWorkspaceMembers(workspace.id),
      getAccountTerms(accountId),
      getFinanceMembers(workspace.id),
      getBillingForMonth(workspace.id, year, month),
    ]);

  const finance = financeRows[0] ?? null;
  const consultants = consultantRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    neurona: r.neurona,
    roleLabel: r.roleLabel,
    displayName: r.fullName ?? r.email,
    email: r.email,
  }));
  const billing = allBilling.filter((b) => b.accountId === accountId);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <Link
        href="/app/finanzas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={15} />
        Finanzas
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{account.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {account.ownerName ?? account.ownerEmail ?? "Sin responsable"}
          {consultants.length > 0 && (
            <> · {consultants.map((c) => c.displayName).join(", ")}</>
          )}
        </p>
      </div>

      {/* 1. Documentos */}
      <GlassCard className="p-6">
        <FinanceDocs
          accountId={accountId}
          nda={{
            fileName: finance?.ndaFileName ?? null,
            url: finance?.ndaUrl ?? null,
            hasDoc: !!(finance?.ndaStoragePath || finance?.ndaUrl),
          }}
          proposal={{
            fileName: finance?.proposalFileName ?? null,
            url: finance?.proposalUrl ?? null,
            hasDoc: !!(finance?.proposalStoragePath || finance?.proposalUrl),
          }}
          ndaExtractionStatus={finance?.ndaExtractionStatus ?? "none"}
          ndaExtractionError={finance?.ndaExtractionError ?? null}
        />
      </GlassCard>

      {/* 2. Términos */}
      <GlassCard className="p-6">
        <TermsEditor accountId={accountId} terms={terms} members={financeMembers} />
      </GlassCard>

      {/* 3. Datos de facturación y legales */}
      <GlassCard className="p-6">
        <FinanceBillingForm accountId={accountId} finance={finance} />
      </GlassCard>

      {/* 4. Equipo consultor */}
      <GlassCard className="p-6">
        <FinanceTeam
          accountId={accountId}
          consultants={consultants}
          members={members}
          services={workspace.services ?? []}
        />
      </GlassCard>

      {/* 5. A facturar (esta cuenta) */}
      <GlassCard className="p-6">
        <AccountBillingPanel
          accountId={accountId}
          accountName={account.name}
          year={year}
          month={month}
          billing={billing}
        />
      </GlassCard>
    </div>
  );
}
