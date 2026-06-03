import { db } from "@/lib/drizzle/db";
import {
  accountFinance,
  accountConsultants,
  users,
} from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";
import { getWorkspaceMembers } from "@/lib/queries/workspace";
import { getAccountTerms, getFinanceMembers } from "@/lib/queries/finance";
import { GlassCard } from "@/components/ui/glass-card";
import { FinanceTeam } from "./finance-team";
import { FinanceBillingForm } from "./finance-billing-form";
import { TermsEditor } from "@/components/finance/terms-editor";

interface Props {
  accountId: string;
  workspaceId: string;
  services: string[];
}

export async function FinanceSection({ accountId, workspaceId, services }: Props) {
  const [financeRows, consultantRows, members, terms, financeMembers] =
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
      getWorkspaceMembers(workspaceId),
      getAccountTerms(accountId),
      getFinanceMembers(workspaceId),
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

  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-6">Finanzas</h2>

      <div className="space-y-8">
        {/* Consultant team */}
        <FinanceTeam
          accountId={accountId}
          consultants={consultants}
          members={members}
          services={services}
        />

        {/* Billing / legal form */}
        <div className="pt-6 [border-top:1px_solid_var(--glass-border)]">
          <FinanceBillingForm accountId={accountId} finance={finance} />
        </div>

        {/* Términos */}
        <div className="pt-6 [border-top:1px_solid_var(--glass-border)]">
          <TermsEditor
            accountId={accountId}
            terms={terms}
            members={financeMembers}
          />
        </div>

        {/* TODO Task 10: NDA/Propuesta docs */}
      </div>
    </GlassCard>
  );
}
