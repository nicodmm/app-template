"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Sparkles, Save } from "lucide-react";
import { saveTermsRawText, structureTerms } from "@/app/actions/finance-terms";
import {
  deleteEngagement,
  deletePeriod,
  deleteShare,
  mapShareMember,
} from "@/app/actions/finance-terms";
import type { AccountTerms } from "@/lib/queries/finance";
import type { FinanceMember } from "@/lib/queries/finance";
import {
  EngagementDialog,
  PeriodDialog,
  ShareDialog,
  type EngagementData,
  type PeriodData,
  type ShareData,
} from "./term-dialogs";

interface Props {
  accountId: string;
  terms: AccountTerms;
  members: FinanceMember[];
}

const STATUS_TEXT: Record<string, string> = {
  none: "Sin estructurar",
  structuring: "Estructurando…",
  ready: "Listo",
  error: "Error",
};

const STATUS_STYLE: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  structuring: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  error: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const CURRENCY_LABEL: Record<string, string> = { USD: "USD", ARS: "ARS" };
const BILLING_RULE_LABEL: Record<string, string> = {
  same: "Misma moneda",
  mep: "MEP",
  mep_ipc: "MEP + IPC",
};
const ENGAGEMENT_STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  ended: "Finalizado",
};

const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] hover:bg-white/40 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";
const iconBtn =
  "shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors disabled:opacity-50";

function IATag() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-violet-500/15 text-violet-700 dark:text-violet-300">
      <Sparkles size={9} aria-hidden />
      IA
    </span>
  );
}

export function TermsEditor({ accountId, terms, members }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState(terms.termsRawText ?? "");

  // Dialog state
  const [engagementDialog, setEngagementDialog] = useState<
    { edit: EngagementData | null } | null
  >(null);
  const [periodDialog, setPeriodDialog] = useState<{
    engagementId: string;
    defaultCurrency: string;
    edit: PeriodData | null;
  } | null>(null);
  const [shareDialog, setShareDialog] = useState<{
    engagementId: string;
    edit: ShareData | null;
  } | null>(null);

  const status = terms.termsStatus ?? "none";
  const isStructuring = status === "structuring";

  // Auto-refresh while the structuring task runs out of band.
  useEffect(() => {
    if (!isStructuring) return;
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      if (count > 30) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [isStructuring, router]);

  function handleSaveRaw() {
    setError(null);
    startTransition(async () => {
      const res = await saveTermsRawText({ accountId, rawText });
      if (!res.success) {
        setError(res.error ?? "Error al guardar");
        return;
      }
      router.refresh();
    });
  }

  function handleStructure() {
    setError(null);
    startTransition(async () => {
      const res = await structureTerms({ accountId });
      if (!res.success) {
        setError(res.error ?? "Error al estructurar");
        return;
      }
      router.refresh();
    });
  }

  function handleDeleteEngagement(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteEngagement({ accountId, id });
      if (!res.success) setError(res.error ?? "Error al eliminar");
      else router.refresh();
    });
  }

  function handleDeletePeriod(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deletePeriod({ accountId, id });
      if (!res.success) setError(res.error ?? "Error al eliminar");
      else router.refresh();
    });
  }

  function handleDeleteShare(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteShare({ accountId, id });
      if (!res.success) setError(res.error ?? "Error al eliminar");
      else router.refresh();
    });
  }

  function handleMapMember(id: string, memberId: string) {
    setError(null);
    startTransition(async () => {
      const res = await mapShareMember({
        accountId,
        id,
        memberId: memberId || null,
      });
      if (!res.success) setError(res.error ?? "Error al asignar");
      else router.refresh();
    });
  }

  const selectClass =
    "rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Términos
      </h3>

      {/* NL block */}
      <div className="rounded-lg p-3 space-y-3 [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Términos en lenguaje natural
          </p>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              STATUS_STYLE[status] ?? STATUS_STYLE.none
            }`}
          >
            {STATUS_TEXT[status] ?? status}
          </span>
        </div>

        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Pegá o escribí los términos del acuerdo en lenguaje natural…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
          disabled={isPending}
        />

        {status === "error" && terms.termsError && (
          <p className="text-xs text-destructive">{terms.termsError}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveRaw}
            disabled={isPending}
            className={ghostBtn}
          >
            <Save size={13} aria-hidden />
            Guardar
          </button>
          <button
            type="button"
            onClick={handleStructure}
            disabled={isPending || isStructuring}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={13} aria-hidden />
            {isStructuring ? "Estructurando…" : "Estructurar con IA"}
          </button>
        </div>
      </div>

      {/* Engagements */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Engagements</p>
        <button
          type="button"
          onClick={() => setEngagementDialog({ edit: null })}
          disabled={isPending}
          className={ghostBtn}
        >
          <Plus size={13} aria-hidden />
          Agregar engagement
        </button>
      </div>

      {terms.engagements.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin engagements.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {terms.engagements.map((eng) => (
            <li
              key={eng.id}
              className="rounded-lg p-3 [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
            >
              {/* Engagement header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{eng.neurona}</span>
                    {eng.source === "llm" && <IATag />}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {ENGAGEMENT_STATUS_LABEL[eng.status] ?? eng.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[
                      CURRENCY_LABEL[eng.currency] ?? eng.currency,
                      BILLING_RULE_LABEL[eng.billingRule] ?? eng.billingRule,
                      [eng.startDate, eng.endDate].filter(Boolean).join(" → ") ||
                        null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setEngagementDialog({
                        edit: {
                          id: eng.id,
                          neurona: eng.neurona,
                          currency: eng.currency,
                          billingRule: eng.billingRule,
                          startDate: eng.startDate,
                          endDate: eng.endDate,
                          status: eng.status,
                        },
                      })
                    }
                    disabled={isPending}
                    className={iconBtn}
                    aria-label="Editar engagement"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEngagement(eng.id)}
                    disabled={isPending}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    aria-label="Eliminar engagement"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>

              {/* Periods */}
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Períodos
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPeriodDialog({
                        engagementId: eng.id,
                        defaultCurrency: eng.currency,
                        edit: null,
                      })
                    }
                    disabled={isPending}
                    className={ghostBtn}
                  >
                    <Plus size={12} aria-hidden />
                    Agregar período
                  </button>
                </div>
                {eng.periods.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Sin períodos.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {eng.periods.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">
                            {p.fromDate} → {p.toDate ?? "—"}
                          </span>
                          <span className="font-medium">
                            {p.fee.toLocaleString()} {p.currency}
                          </span>
                          {p.source === "llm" && <IATag />}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setPeriodDialog({
                                engagementId: eng.id,
                                defaultCurrency: eng.currency,
                                edit: {
                                  id: p.id,
                                  fromDate: p.fromDate,
                                  toDate: p.toDate,
                                  fee: p.fee,
                                  currency: p.currency,
                                },
                              })
                            }
                            disabled={isPending}
                            className={iconBtn}
                            aria-label="Editar período"
                          >
                            <Pencil size={12} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePeriod(p.id)}
                            disabled={isPending}
                            className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                            aria-label="Eliminar período"
                          >
                            <Trash2 size={12} aria-hidden />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Shares */}
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fee shares
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setShareDialog({ engagementId: eng.id, edit: null })
                    }
                    disabled={isPending}
                    className={ghostBtn}
                  >
                    <Plus size={12} aria-hidden />
                    Agregar share
                  </button>
                </div>
                {eng.shares.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Sin shares.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {eng.shares.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)]"
                      >
                        <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <select
                            value={s.memberId ?? ""}
                            onChange={(e) =>
                              handleMapMember(s.id, e.target.value)
                            }
                            disabled={isPending}
                            className={selectClass}
                            aria-label="Asignar consultor"
                          >
                            <option value="">(sin asignar)</option>
                            {members.map((m) => (
                              <option key={m.memberId} value={m.memberId}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          {!s.memberId && s.consultantNameRaw && (
                            <span className="text-muted-foreground italic">
                              {s.consultantNameRaw}
                            </span>
                          )}
                          <span className="font-medium">
                            {s.shareType === "percent"
                              ? `${s.shareValue}%`
                              : `${s.shareValue.toLocaleString()}${
                                  s.shareCurrency ? ` ${s.shareCurrency}` : ""
                                }`}
                          </span>
                          {s.source === "llm" && <IATag />}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setShareDialog({
                                engagementId: eng.id,
                                edit: {
                                  id: s.id,
                                  memberId: s.memberId,
                                  consultantNameRaw: s.consultantNameRaw,
                                  shareType: s.shareType,
                                  shareValue: s.shareValue,
                                  shareCurrency: s.shareCurrency,
                                },
                              })
                            }
                            disabled={isPending}
                            className={iconBtn}
                            aria-label="Editar share"
                          >
                            <Pencil size={12} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShare(s.id)}
                            disabled={isPending}
                            className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                            aria-label="Eliminar share"
                          >
                            <Trash2 size={12} aria-hidden />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {/* Dialogs */}
      {engagementDialog && (
        <EngagementDialog
          accountId={accountId}
          edit={engagementDialog.edit}
          onClose={() => setEngagementDialog(null)}
        />
      )}
      {periodDialog && (
        <PeriodDialog
          accountId={accountId}
          engagementId={periodDialog.engagementId}
          defaultCurrency={periodDialog.defaultCurrency}
          edit={periodDialog.edit}
          onClose={() => setPeriodDialog(null)}
        />
      )}
      {shareDialog && (
        <ShareDialog
          accountId={accountId}
          engagementId={shareDialog.engagementId}
          members={members}
          edit={shareDialog.edit}
          onClose={() => setShareDialog(null)}
        />
      )}
    </div>
  );
}
