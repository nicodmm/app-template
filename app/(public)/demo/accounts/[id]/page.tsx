import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ExternalLink,
  Eye,
  Edit3,
  Sparkles,
  CheckSquare,
  Users,
  Zap,
  TrendingUp,
  FolderOpen,
  CircleCheck,
  AlertTriangle,
  AlertOctagon,
  MinusCircle,
  Lock,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { cn } from "@/lib/utils";
import {
  getDemoAccountById,
  getDemoAccountDetail,
  type DemoTask,
  type DemoSignal,
  type DemoTranscript,
  type DemoContextDoc,
  type DemoParticipant,
  type DemoHealthHistory,
  type DemoCampaign,
} from "@/lib/demo/mock-data";

interface PageProps {
  params: Promise<{ id: string }>;
}

const HEALTH_CONFIG = {
  green: {
    label: "Al día",
    Icon: CircleCheck,
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30",
  },
  yellow: {
    label: "Atención",
    Icon: AlertTriangle,
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30",
  },
  red: {
    label: "En riesgo",
    Icon: AlertOctagon,
    cls: "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/30",
  },
  inactive: {
    label: "Sin actividad",
    Icon: MinusCircle,
    cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/30",
  },
};

function formatDate(d: Date | string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(
    "es-AR",
    opts ?? { year: "numeric", month: "short", day: "numeric" }
  );
}

function formatMoney(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}

export default async function DemoAccountDetailPage({ params }: PageProps) {
  const { id } = await params;
  const account = getDemoAccountById(id);
  if (!account) notFound();
  const detail = getDemoAccountDetail(id);
  const signal = (account.healthSignal ?? "inactive") as keyof typeof HEALTH_CONFIG;
  const healthCfg = HEALTH_CONFIG[signal];
  const HealthIcon = healthCfg.Icon;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href="/demo/portfolio"
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
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                healthCfg.cls
              )}
            >
              <HealthIcon size={11} aria-hidden />
              {healthCfg.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {account.ownerName ?? account.ownerEmail ?? "Sin responsable"}
            {account.aiSummaryUpdatedAt && (
              <> · Actualizado {formatDate(account.aiSummaryUpdatedAt)}</>
            )}
          </p>
        </div>
        <DisabledButton label="Editar" icon={<Edit3 size={13} />} />
      </div>

      {/* Vista pública (showcase) */}
      <GlassCard className="p-6 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1 flex items-center gap-2">
              <Eye size={16} aria-hidden /> Vista pública
            </h2>
            <p className="text-sm text-muted-foreground">
              El cliente accede a un dashboard read-only de su cuenta vía un
              link único.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              <Lock size={11} className="inline -mt-0.5 mr-1" aria-hidden />
              En el demo está desactivado. En tu cuenta real generás el link
              con un click.
            </p>
          </div>
          <DisabledButton label="Generar link público" />
        </div>
      </GlassCard>

      {/* AI Summary */}
      <GlassCard className="p-6 mb-6">
        <h2 className="font-semibold mb-3">Resumen de situación</h2>
        <div className="text-sm text-foreground">
          <RichMarkdown text={account.aiSummary ?? ""} />
        </div>
        {account.healthJustification && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 [border-top:1px_solid_var(--glass-border)]">
            {account.healthJustification}
          </p>
        )}
      </GlassCard>

      {/* Context */}
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
                {formatDate(account.startDate, {
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
          {account.employeeCount && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Empleados
              </p>
              <p className="text-sm leading-relaxed">{account.employeeCount}</p>
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
      </GlassCard>

      {/* Paid media */}
      {detail.paidMedia && (
        <PaidMediaCard data={detail.paidMedia} />
      )}

      {/* CRM */}
      {detail.crm && <CrmCard deal={detail.crm} />}

      {/* Last meeting */}
      {detail.transcripts.length > 0 && (
        <LastMeetingCard transcript={detail.transcripts[0]} />
      )}

      {/* Files */}
      {detail.files.length > 0 && (
        <FilesCard files={detail.files} />
      )}

      {/* Tasks */}
      {detail.tasks.length > 0 && (
        <TasksCard tasks={detail.tasks} />
      )}

      {/* Participants */}
      {detail.participants.length > 0 && (
        <ParticipantsCard participants={detail.participants} />
      )}

      {/* Signals */}
      {detail.signals.length > 0 && (
        <SignalsCard signals={detail.signals} />
      )}

      {/* Health history */}
      {detail.healthHistory.length > 0 && (
        <HealthHistoryCard history={detail.healthHistory} />
      )}

      {/* Older meetings */}
      {detail.transcripts.length > 1 && (
        <OlderMeetingsCard transcripts={detail.transcripts.slice(1)} />
      )}
    </div>
  );
}

function DisabledButton({
  label,
  icon,
}: {
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      title="Disponible en cuentas reales"
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium opacity-60 cursor-not-allowed backdrop-blur-[16px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
    >
      {icon}
      {label}
      <Lock size={10} aria-hidden />
    </span>
  );
}

function PaidMediaCard({
  data,
}: {
  data: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    campaigns: DemoCampaign[];
  };
}) {
  return (
    <GlassCard className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <TrendingUp size={16} aria-hidden /> Paid media (últimos 30 días)
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KpiCell label="Inversión" value={formatMoney(data.spend / 100)} />
        <KpiCell label="Impresiones" value={formatNumber(data.impressions)} />
        <KpiCell label="Clicks" value={formatNumber(data.clicks)} />
        <KpiCell label="Conversiones" value={formatNumber(data.conversions)} />
      </div>
      <div className="rounded-lg overflow-x-auto [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground [border-bottom:1px_solid_var(--glass-tile-border)]">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Campaña</th>
              <th className="px-2 py-2 text-left font-medium">Estado</th>
              <th className="px-2 py-2 text-right font-medium">Inversión</th>
              <th className="px-2 py-2 text-right font-medium">CTR</th>
              <th className="px-2 py-2 text-right font-medium">CPC</th>
              <th className="px-2 py-2 text-right font-medium">Conv.</th>
              <th className="px-2 py-2 text-right font-medium">CPA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.campaigns.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-2 max-w-[260px]">
                  <div className="flex flex-col">
                    <span className="truncate">{c.name}</span>
                    {c.publicName && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        Público: {c.publicName}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      c.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  {formatMoney(c.spend / 100)}
                </td>
                <td className="px-2 py-2 text-right">{c.ctr.toFixed(2)}%</td>
                <td className="px-2 py-2 text-right">
                  {formatMoney(c.cpc, "USD")}
                </td>
                <td className="px-2 py-2 text-right">{c.conversions}</td>
                <td className="px-2 py-2 text-right">
                  {c.conversions > 0 ? formatMoney(c.cpa, "USD") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function CrmCard({
  deal,
}: {
  deal: {
    title: string;
    pipeline: string;
    stage: string;
    value: number;
    currency: string;
    status: "open" | "won" | "lost";
  };
}) {
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-3">CRM</h2>
      <div className="text-sm">
        <p className="font-medium mb-1">{deal.title}</p>
        <p className="text-muted-foreground">
          {deal.pipeline} · {deal.stage} ·{" "}
          <strong className="text-foreground">
            {formatMoney(deal.value, deal.currency)}
          </strong>{" "}
          · estado: {deal.status}
        </p>
      </div>
    </GlassCard>
  );
}

function LastMeetingCard({ transcript }: { transcript: DemoTranscript }) {
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-1">Última reunión</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {transcript.fileName}
        {transcript.meetingDate && (
          <> · {formatDate(transcript.meetingDate)}</>
        )}
      </p>
      <div className="text-sm">
        <RichMarkdown text={transcript.meetingSummary} />
      </div>
    </GlassCard>
  );
}

function FilesCard({ files }: { files: DemoContextDoc[] }) {
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <FolderOpen size={16} aria-hidden /> Archivos de contexto
      </h2>
      <ul className="space-y-2 text-sm">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{f.title}</p>
              {f.notes && (
                <p className="text-xs text-muted-foreground truncate">
                  {f.notes}
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDate(f.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function TasksCard({ tasks }: { tasks: DemoTask[] }) {
  const STATUS_LABEL: Record<string, string> = {
    pending: "Pendiente",
    in_progress: "En curso",
    completed: "Completada",
  };
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <CheckSquare size={16} aria-hidden /> Tareas
      </h2>
      <ul className="space-y-2 text-sm">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <span className="truncate">{t.description}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {STATUS_LABEL[t.status] ?? t.status}
              {t.assigneeName ? ` · ${t.assigneeName}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function ParticipantsCard({ participants }: { participants: DemoParticipant[] }) {
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <Users size={16} aria-hidden /> Contactos y participantes
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {participants.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-0.5 rounded-md px-3 py-2 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <span className="font-medium">{p.name}</span>
            <span className="text-xs text-muted-foreground">
              {p.role ?? "Sin rol"}
              {p.email ? ` · ${p.email}` : ""}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {p.appearanceCount} aparición
              {p.appearanceCount !== 1 ? "es" : ""} en reuniones
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function SignalsCard({ signals }: { signals: DemoSignal[] }) {
  const TYPE_LABEL: Record<string, string> = {
    upsell_opportunity: "Oportunidad de upsell",
    growth_opportunity: "Oportunidad de crecimiento",
    risk: "Riesgo",
    warning: "Atención",
  };
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <Zap size={16} aria-hidden /> Señales
      </h2>
      <ul className="space-y-3 text-sm">
        {signals.map((s) => (
          <li
            key={s.id}
            className="rounded-md px-3 py-2.5 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles
                size={12}
                className="text-primary"
                aria-hidden
              />
              <span className="font-medium">
                {TYPE_LABEL[s.type] ?? s.type}
              </span>
              <span className="text-xs text-muted-foreground">
                · {formatDate(s.createdAt)}
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {s.description}
            </p>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function HealthHistoryCard({ history }: { history: DemoHealthHistory[] }) {
  const COLOR: Record<string, string> = {
    green: "#10b981",
    yellow: "#f59e0b",
    red: "#dc2626",
    inactive: "#94a3b8",
  };
  const sorted = [...history].reverse();
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <TrendingUp size={16} aria-hidden /> Evolución de salud
      </h2>
      <div className="flex items-end gap-1 h-12 mb-2">
        {sorted.map((h) => (
          <div
            key={h.id}
            className="flex-1 rounded-sm"
            style={{
              backgroundColor: COLOR[h.healthSignal] ?? COLOR.inactive,
              height: "100%",
            }}
            title={formatDate(h.createdAt)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {sorted.length} semana{sorted.length !== 1 ? "s" : ""} de historial ·
        más antiguo a la izquierda
      </p>
    </GlassCard>
  );
}

function OlderMeetingsCard({ transcripts }: { transcripts: DemoTranscript[] }) {
  return (
    <GlassCard className="p-6 mb-6">
      <h2 className="font-semibold mb-3">Reuniones anteriores</h2>
      <ul className="space-y-3 text-sm">
        {transcripts.map((t) => (
          <li
            key={t.id}
            className="rounded-md px-3 py-2.5 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
          >
            <p className="font-medium mb-0.5">{t.fileName}</p>
            <p className="text-xs text-muted-foreground mb-2">
              {formatDate(t.meetingDate)}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t.meetingSummary}
            </p>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
