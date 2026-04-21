import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle/db";
import { accounts } from "@/lib/drizzle/schema";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId } from "@/lib/queries/workspace";
import { getCrmConnectionState, getMappingPageData } from "@/lib/queries/crm";
import { getProvider } from "@/lib/crm/provider";
import { getConnectionOrThrow } from "@/lib/crm/token-refresh";
import { CrmMappingForm } from "@/components/crm-mapping-form";
import type { CrmCustomField } from "@/lib/crm/types";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

export default async function CrmSetupPage({ params }: PageProps) {
  const { accountId } = await params;
  const userId = await requireUserId();
  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) return notFound();

  const acc = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspace.id)))
    .limit(1);
  if (acc.length === 0) return notFound();

  const state = await getCrmConnectionState(workspace.id, accountId);
  if (state.state === "no_connection") {
    redirect(`/app/accounts/${accountId}/crm`);
  }

  const connection = await getConnectionOrThrow(state.connection.id);
  const mapping = await getMappingPageData(connection.id);

  // Fetch custom fields live (not cached)
  let customFields: CrmCustomField[] = [];
  try {
    const provider = getProvider(connection.provider);
    customFields = await provider.fetchCustomFields({
      accessToken: connection.accessToken,
      apiDomain: connection.externalCompanyDomain
        ? `${connection.externalCompanyDomain}.pipedrive.com`
        : "api.pipedrive.com",
    });
  } catch (err) {
    console.error("[crm-setup] fetchCustomFields failed", err);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-1">Configurar sincronización CRM</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cliente: {acc[0].name} · Proveedor: {connection.provider}
        {connection.externalCompanyDomain && ` · ${connection.externalCompanyDomain}`}
      </p>
      <CrmMappingForm
        accountId={accountId}
        connectionId={connection.id}
        pipelines={mapping.pipelines}
        customFields={customFields}
        sourceConfig={mapping.sourceConfig}
      />
    </div>
  );
}
