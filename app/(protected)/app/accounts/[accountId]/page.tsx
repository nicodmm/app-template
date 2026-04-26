import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  CheckSquare,
  Users as UsersIcon,
  Zap,
  TrendingUp,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { requireUserId } from "@/lib/auth";
import {
  getWorkspaceWithMember,
  getWorkspaceMembers,
} from "@/lib/queries/workspace";
import { getAccountById } from "@/lib/queries/accounts";
import {
  deleteAccount,
} from "@/app/actions/accounts";
import { AccountHealthBadge } from "@/components/account-health-badge";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { EditAccountForm } from "@/components/edit-account-form";
import { ContextUploadForm } from "@/components/context-upload-form";
import { DeleteButton } from "@/components/delete-button";
import { GlassCard } from "@/components/ui/glass-card";
import { PaidMediaMiniCard } from "@/components/paid-media-mini-card";
import { CrmMiniCard } from "@/components/crm-mini-card";
import { ReEnrichButton } from "@/components/re-enrich-button";
import { isModuleEnabled } from "@/lib/modules-client";
import { LastMeetingSection } from "@/components/account-detail/last-meeting-section";
import { FilesSection } from "@/components/account-detail/files-section";
import { TasksSection } from "@/components/account-detail/tasks-section";
import { ParticipantsSection } from "@/components/account-detail/participants-section";
import { SignalsSection } from "@/components/account-detail/signals-section";
import { HealthSection } from "@/components/account-detail/health-section";
import { SectionSkeleton } from "@/components/account-detail/section-skeleton";

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

  const result = await getWorkspaceWithMember(userId);
  if (!result) redirect("/auth/login");
  const { workspace, member: viewerMember } = result;

  const [account, members] = await Promise.all([
    getAccountById(accountId, workspace.id, {
      userId,
      role: viewerMember.role,
    }),
    getWorkspaceMembers(workspace.id),
  ]);

  if (!account) notFound();

  const isEditing = edit === "1";
  const hasAgencyContext = Boolean(workspace.agencyContext?.trim());

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold truncate">{account.name}</h1>
            <AccountHealthBadge signal={account.healthSignal} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {account.ownerName ?? account.ownerEmail ?? "Sin responsable"}
            {account.aiSummaryUpdatedAt && (
              <>
                {" · "}Actualizado{" "}
                {new Date(account.aiSummaryUpdatedAt).toLocaleDateString(
                  "es-AR"
                )}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link
            href={`/app/accounts/${accountId}?edit=1`}
            className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10"
          >
            Editar
          </Link>
          <DeleteButton
            action={async () => {
              "use server";
              await deleteAccount(accountId);
            }}
            confirmMessage={`¿Eliminar la cuenta "${account.name}"? Esta acción no se puede deshacer.`}
            className="inline-flex items-center rounded-md text-destructive px-3 py-1.5 text-xs font-medium transition-colors backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_rgb(239_68_68/0.3)] hover:bg-destructive/10"
          >
            Eliminar
          </DeleteButton>
        </div>
      </div>

      {/* Edit form */}
      {isEditing && (
        <GlassCard variant="strong" className="p-6 mb-8 ring-1 ring-primary/20">
          <h2 className="font-semibold mb-4">Editar cuenta</h2>
          <EditAccountForm
            account={account}
            members={members}
            services={workspace.services ?? []}
          />
        </GlassCard>
      )}

      {/* AI Summary */}
      <GlassCard className="p-6 mb-6">
        <h2 className="font-semibold mb-3">Resumen de situación</h2>
        {account.aiSummary ? (
          <div className="text-sm text-foreground">
            <RichMarkdown text={account.aiSummary} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Procesá una transcripción para generar el resumen de la cuenta.
          </p>
        )}
        {account.healthJustification && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 [border-top:1px_solid_var(--glass-border)]">
            {account.healthJustification}
          </p>
        )}
      </GlassCard>

      {/* Account context */}
      {(account.goals ||
        account.serviceScope ||
        account.startDate ||
        account.fee ||
        account.industry ||
        account.employeeCount ||
        account.location ||
        account.companyDescription ||
        account.websiteUrl ||
        account.linkedinUrl ||
        account.enrichmentStatus) && (
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">Contexto de la cuenta</h2>
              {account.industry && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {account.industry}
                </span>
              )}
            </div>
            {account.websiteUrl && (
              <ReEnrichButton
                accountId={accountId}
                disabled={account.enrichmentStatus === "pending"}
              />
            )}
          </div>

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
                  USD{" "}
                  {Number(account.fee).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            )}
            {account.employeeCount && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Empleados
                </p>
                <p className="text-sm leading-relaxed">
                  {account.employeeCount}
                </p>
              </div>
            )}
            {account.location && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Ubicación
                </p>
                <p className="text-sm leading-relaxed">{account.location}</p>
              </div>
            )}
            {(account.websiteUrl || account.linkedinUrl) && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Links
                </p>
                <div className="flex flex-wrap gap-2">
                  {account.websiteUrl && (
                    <a
                      href={account.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10"
                    >
                      Web <ExternalLink size={11} aria-hidden />
                    </a>
                  )}
                  {account.linkedinUrl && (
                    <a
                      href={account.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10"
                    >
                      LinkedIn <ExternalLink size={11} aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {account.companyDescription && (
            <p className="text-sm text-muted-foreground leading-relaxed mt-6 pt-4 [border-top:1px_solid_var(--glass-border)]">
              {account.companyDescription}
            </p>
          )}

          {account.enrichmentStatus && (
            <p className="text-xs text-muted-foreground mt-4">
              {account.enrichmentStatus === "pending" &&
                "Enriqueciendo perfil desde la web..."}
              {account.enrichmentStatus === "ok" && account.enrichedAt && (
                <>
                  Enriquecido el{" "}
                  {new Date(account.enrichedAt).toLocaleDateString("es-AR", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </>
              )}
              {account.enrichmentStatus === "failed" && (
                <span className="text-destructive">
                  Error al enriquecer:{" "}
                  {account.enrichmentError ?? "desconocido"}
                </span>
              )}
            </p>
          )}
        </GlassCard>
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

      {/* Last meeting (streamed) */}
      {isModuleEnabled(account.enabledModules, "context_upload") && (
        <Suspense fallback={null}>
          <LastMeetingSection accountId={accountId} />
        </Suspense>
      )}

      {/* Context Upload */}
      {isModuleEnabled(account.enabledModules, "context_upload") && (
        <GlassCard className="p-6 mb-6">
          <h2 className="font-semibold mb-4">Subir contexto</h2>
          <ContextUploadForm accountId={accountId} />
        </GlassCard>
      )}

      {/* Collapsible modules — each streamed independently */}
      <div className="space-y-4">
        {isModuleEnabled(account.enabledModules, "context_upload") && (
          <Suspense
            fallback={
              <SectionSkeleton
                title="Archivos de contexto"
                icon={<FolderOpen size={16} aria-hidden />}
              />
            }
          >
            <FilesSection accountId={accountId} />
          </Suspense>
        )}

        {isModuleEnabled(account.enabledModules, "tasks") && (
          <Suspense
            fallback={
              <SectionSkeleton
                title="Tareas"
                icon={<CheckSquare size={16} aria-hidden />}
              />
            }
          >
            <TasksSection accountId={accountId} members={members} />
          </Suspense>
        )}

        {isModuleEnabled(account.enabledModules, "participants") && (
          <Suspense
            fallback={
              <SectionSkeleton
                title="Contactos y Participantes"
                icon={<UsersIcon size={16} aria-hidden />}
              />
            }
          >
            <ParticipantsSection accountId={accountId} />
          </Suspense>
        )}

        {isModuleEnabled(account.enabledModules, "signals") && (
          <Suspense
            fallback={
              <SectionSkeleton
                title="Señales"
                icon={<Zap size={16} aria-hidden />}
              />
            }
          >
            <SignalsSection
              accountId={accountId}
              hasAgencyContext={hasAgencyContext}
            />
          </Suspense>
        )}

        {isModuleEnabled(account.enabledModules, "health") && (
          <Suspense
            fallback={
              <SectionSkeleton
                title="Evolución de salud"
                icon={<TrendingUp size={16} aria-hidden />}
              />
            }
          >
            <HealthSection accountId={accountId} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
