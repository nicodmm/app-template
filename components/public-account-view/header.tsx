import Link from "next/link";
import type { PublicAccountSnapshot } from "@/lib/queries/public-account";
import { SummarySection } from "./summary-section";
import { ContextSection } from "./context-section";
import { LastMeetingSection } from "./last-meeting-section";
import { FilesSection } from "./files-section";
import { TasksSection } from "./tasks-section";
import { ParticipantsSection } from "./participants-section";
import { SignalsSection } from "./signals-section";
import { HealthSection } from "./health-section";
import { CrmSection } from "./crm-section";
import { PaidMediaSection } from "./paid-media-section";

interface Props {
  snapshot: PublicAccountSnapshot;
}

function formatRelative(d: Date | null): string {
  if (!d) return "sin actividad reciente";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "actualizado hoy";
  if (days < 7) return `actualizado hace ${days} día${days !== 1 ? "s" : ""}`;
  const weeks = Math.floor(days / 7);
  return `actualizado hace ${weeks} semana${weeks !== 1 ? "s" : ""}`;
}

export function PublicAccountView({ snapshot }: Props) {
  const { workspace, account, config, data } = snapshot;
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-muted-foreground">{workspace.name}</p>
        <h1 className="text-3xl font-semibold">{account.name}</h1>
        <p className="text-sm text-muted-foreground">
          {account.industry && <>{account.industry} · </>}
          {account.ownerName ? `Tu equipo: ${account.ownerName}` : null}
        </p>
      </header>

      {config.summary && data.summary && (
        <SummarySection clientSummary={data.summary.clientSummary} />
      )}
      {config.context && data.context && (
        <ContextSection data={data.context} />
      )}
      {config.lastMeeting && data.lastMeeting && (
        <LastMeetingSection data={data.lastMeeting} />
      )}
      {config.tasks && data.tasks && <TasksSection rows={data.tasks} />}
      {config.participants && data.participants && (
        <ParticipantsSection rows={data.participants} />
      )}
      {config.signals && data.signals && (
        <SignalsSection rows={data.signals} />
      )}
      {config.crm && data.crm && <CrmSection data={data.crm} />}
      {config.health && data.health && <HealthSection rows={data.health} />}
      {config.files && data.files && <FilesSection rows={data.files} />}
      {config.paidMedia && data.paidMedia && (
        <PaidMediaSection data={data.paidMedia} />
      )}

      <footer className="pt-8 mt-8 [border-top:1px_solid_var(--glass-border)] text-center space-y-1">
        <p className="text-xs text-muted-foreground">
          {formatRelative(account.lastActivityAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          Hecho con{" "}
          <Link href="https://nao.fyi" className="underline">
            nao.fyi
          </Link>
        </p>
      </footer>
    </div>
  );
}
