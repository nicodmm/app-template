"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

// TODO Task 14: CV/Informe viewer, actions, recruiter notes, client feedback

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  advance: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  offer: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  advance: "Avanza",
  offer: "Oferta",
  rejected: "Descartado",
};

interface Props {
  accountId: string;
  searchId: string;
  candidate: SelectionCandidate;
}

export function CandidateDetailPanel({ accountId: _accountId, searchId: _searchId, candidate }: Props) {
  const statusStyle = STATUS_STYLE[candidate.status] ?? STATUS_STYLE.pending;
  const statusLabel = STATUS_LABEL[candidate.status] ?? candidate.status;

  return (
    <GlassCard className="p-6 flex flex-col gap-4">
      {/* Name + status */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold leading-tight">
          {candidate.firstName} {candidate.lastName}
        </h2>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
            statusStyle
          )}
        >
          {statusLabel}
        </span>
      </div>

      {/* Contact details */}
      <div className="flex flex-col gap-2 text-sm">
        {candidate.email && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Email</span>
            <span>{candidate.email}</span>
          </div>
        )}
        {candidate.phone && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Teléfono</span>
            <span>{candidate.phone}</span>
          </div>
        )}
        {candidate.linkedinUrl && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-28 shrink-0">LinkedIn</span>
            <a
              href={candidate.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Ver perfil
              <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        )}
        {candidate.expectedSalary && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Rem. pretendida</span>
            <span>{candidate.expectedSalary}</span>
          </div>
        )}
        {candidate.currentSalary && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Rem. actual</span>
            <span>{candidate.currentSalary}</span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
