import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceByUserId, getWorkspaceMembers } from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import { getTranscriptHistory } from "@/lib/queries/transcripts";
import { getAccountTasks } from "@/lib/queries/tasks";
import { getAccountParticipants } from "@/lib/queries/participants";
import { getAccountSignals, getAccountHealthHistory } from "@/lib/queries/signals";
import { deleteAccount, updateAccount, updateHealthSignal } from "@/app/actions/accounts";
import { AccountHealthBadge } from "@/components/account-health-badge";
import { EditAccountForm } from "@/components/edit-account-form";
import { TranscriptUploadForm } from "@/components/transcript-upload-form";
import { DeleteButton } from "@/components/delete-button";
import { TranscriptHistoryTable } from "@/components/transcript-history-table";
import { TasksPanel } from "@/components/tasks-panel";
import { ParticipantsPanel } from "@/components/participants-panel";
import { SignalsPanel } from "@/components/signals-panel";
import { HealthHistoryTimeline } from "@/components/health-history-timeline";
import { CollapsibleSection } from "@/components/collapsible-section";
import { PaidMediaMiniCard } from "@/components/paid-media-mini-card";
import { CrmMiniCard } from "@/components/crm-mini-card";
import { isModuleEnabled } from "@/lib/modules-client";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ edit?: string; error?: string }>;
}


export default async function AccountDetailPage({
  params,
  searchParams,
}: PageProps) {
  const userId = await requireUserId();
  const { accountId } = await params;
  const { edit, error } = await searchParams;

  const workspace = await getWorkspaceByUserId(userId);
  if (!workspace) redirect("/auth/login");

  const [
    account,
    transcriptHistory,
    members,
    accountTasks,
    accountParticipants,
    accountSignals,
    healthHistory,
  ] = await Promise.all([
    getAccountById(accountId, workspace.id),
    getTranscriptHistory(accountId, 50),
    getWorkspaceMembers(workspace.id),
    getAccountTasks(accountId),
    getAccountParticipants(accountId),
    getAccountSignals(accountId),
    getAccountHealthHistory(accountId),
  ]);

  if (!account) notFound();

  const isEditing = edit === "1";

  // Summaries shown in the collapsed header of each section
  const pendingTasks = accountTasks.filter((t) => t.status === "pending").length;
  const completedTasks = accountTasks.length - pendingTasks;
  const activeSignals = accountSignals.filter((s) => s.status === "active").length;
  const resolvedSignals = accountSignals.length - activeSignals;
  const healthChanges = healthHistory.reduce(
    (acc, e, i) =>
      acc + (!healthHistory[i + 1] || healthHistory[i + 1].healthSignal !== e.healthSignal ? 1 : 0),
    0
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href="/app/portfolio"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        Portfolio
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">{account.name}</h1>
            <AccountHealthBadge signal={account.healthSignal} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {account.ownerName ?? account.ownerEmail ?? "Sin responsable"}
            {account.aiSummaryUpdatedAt && (
              <> · Actualizado {new Date(account.aiSummaryUpdatedAt).toLocaleDateString("es-AR")}</>
            )}
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link
            href={`/app/accounts/${accountId}?edit=1`}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            Editar
          </Link>
          <DeleteButton
            action={async () => {
              "use server";
              await deleteAccount(accountId);
            }}
            confirmMessage={`¿Eliminar la cuenta "${account.name}"? Esta acción no se puede deshacer.`}
            className="inline-flex items-center rounded-md border border-destructive/30 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 transition-colors"
          >
            Eliminar
          </DeleteButton>
        </div>
      </div>

      {/* Edit form */}
      {isEditing && (
        <div className="rounded-xl border border-primary/20 bg-card p-6 mb-8">
          <h2 className="font-semibold mb-4">Editar cuenta</h2>
          <EditAccountForm account={account} members={members} />
        </div>
      )}

      {/* AI Summary */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <h2 className="font-semibold mb-3">Resumen de situación</h2>
        {account.aiSummary ? (
          <div className="text-sm text-foreground leading-relaxed space-y-1">
            {account.aiSummary.split("\n").map((line, i) => {
              if (!line.trim()) return null;
              const parts = line.split(/\*\*(.*?)\*\*/g);
              return (
                <p key={i}>
                  {parts.map((part, j) =>
                    j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                  )}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Procesá una transcripción para generar el resumen de la cuenta.
          </p>
        )}
        {account.healthJustification && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            {account.healthJustification}
          </p>
        )}
      </div>

      {/* Account context */}
      {(account.goals || account.serviceScope || account.startDate || account.fee) && (
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="font-semibold mb-4">Contexto de la cuenta</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {account.goals && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Objetivos
                </p>
                <p className="text-sm leading-relaxed">{account.goals}</p>
              </div>
            )}
            {account.serviceScope && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Scope de servicio
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {account.serviceScope.split(",").map((s) => (
                    <span
                      key={s.trim()}
                      className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {s.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {account.startDate && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Fecha de inicio
                </p>
                <p className="text-sm leading-relaxed">
                  {new Date(account.startDate).toLocaleDateString("es-AR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            )}
            {account.fee && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Fee mensual
                </p>
                <p className="text-sm leading-relaxed">
                  USD {Number(account.fee).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paid Media mini-card */}
      {isModuleEnabled(account.enabledModules, "paid_media") && (
        <div className="mb-6">
          <PaidMediaMiniCard workspaceId={workspace.id} accountId={accountId} />
        </div>
      )}

      {/* CRM mini-card */}
      {isModuleEnabled(account.enabledModules, "crm") && (
        <div className="mb-6">
          <CrmMiniCard workspaceId={workspace.id} accountId={accountId} />
        </div>
      )}

      {/* Transcript Upload */}
      {isModuleEnabled(account.enabledModules, "context_upload") && (
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="font-semibold mb-4">Subir transcripción</h2>
          <TranscriptUploadForm accountId={accountId} />
        </div>
      )}

      {/* Collapsible modules (default closed) */}
      <div className="space-y-4">
        {isModuleEnabled(account.enabledModules, "context_upload") && transcriptHistory.length > 0 && (
          <CollapsibleSection
            title="Historial de transcripciones"
            summary={`${transcriptHistory.length} transcripción${transcriptHistory.length !== 1 ? "es" : ""}`}
          >
            <TranscriptHistoryTable transcripts={transcriptHistory} accountId={accountId} />
          </CollapsibleSection>
        )}

        {isModuleEnabled(account.enabledModules, "tasks") && (
          <CollapsibleSection
            title="✅ Tareas"
            summary={
              accountTasks.length === 0
                ? "sin tareas"
                : `${pendingTasks} pendiente${pendingTasks !== 1 ? "s" : ""}${
                    completedTasks > 0 ? ` · ${completedTasks} completada${completedTasks !== 1 ? "s" : ""}` : ""
                  }`
            }
          >
            <TasksPanel tasks={accountTasks} accountId={accountId} members={members} />
          </CollapsibleSection>
        )}

        {isModuleEnabled(account.enabledModules, "participants") && (
          <CollapsibleSection
            title="👥 Contactos y Participantes"
            summary={
              accountParticipants.length === 0
                ? "sin contactos"
                : `${accountParticipants.length} contacto${accountParticipants.length !== 1 ? "s" : ""}`
            }
          >
            <ParticipantsPanel participants={accountParticipants} />
          </CollapsibleSection>
        )}

        {isModuleEnabled(account.enabledModules, "signals") && (
          <CollapsibleSection
            title="⚡ Señales"
            summary={
              accountSignals.length === 0
                ? "sin señales"
                : `${activeSignals} activa${activeSignals !== 1 ? "s" : ""}${
                    resolvedSignals > 0 ? ` · ${resolvedSignals} resuelta${resolvedSignals !== 1 ? "s" : ""}` : ""
                  }`
            }
          >
            <SignalsPanel signals={accountSignals} accountId={accountId} />
          </CollapsibleSection>
        )}

        {isModuleEnabled(account.enabledModules, "health") && (
          <CollapsibleSection
            title="📈 Evolución de salud"
            summary={
              healthHistory.length === 0
                ? "sin historial"
                : `${healthChanges} cambio${healthChanges !== 1 ? "s" : ""} de estado`
            }
          >
            <HealthHistoryTimeline entries={healthHistory} />
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
