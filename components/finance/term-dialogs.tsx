"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  createEngagement,
  updateEngagement,
  createPeriod,
  updatePeriod,
  createShare,
  updateShare,
} from "@/app/actions/finance-terms";
import type { FinanceMember } from "@/lib/queries/finance";

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "ARS", label: "ARS" },
] as const;

const BILLING_RULE_OPTIONS = [
  { value: "same", label: "Misma moneda" },
  { value: "mep", label: "MEP" },
  { value: "mep_ipc", label: "MEP + IPC" },
] as const;

const ENGAGEMENT_STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "ended", label: "Finalizado" },
] as const;

const SHARE_TYPE_OPTIONS = [
  { value: "percent", label: "Porcentaje (%)" },
  { value: "fixed", label: "Monto fijo" },
] as const;

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const selectClass = inputClass;
const labelClass = "block text-sm font-medium mb-1";

// ---------------------------------------------------------------------------
// Generic dialog shell
// ---------------------------------------------------------------------------
function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] backdrop-blur-[18px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormActions({
  isPending,
  isEdit,
  onClose,
}: {
  isPending: boolean;
  isEdit: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engagement dialog
// ---------------------------------------------------------------------------
export interface EngagementData {
  id: string;
  neurona: string;
  currency: string;
  billingRule: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
}

export function EngagementDialog({
  accountId,
  edit,
  onClose,
}: {
  accountId: string;
  edit: EngagementData | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = edit !== null;

  const [neurona, setNeurona] = useState(edit?.neurona ?? "");
  const [currency, setCurrency] = useState(edit?.currency ?? "USD");
  const [billingRule, setBillingRule] = useState(edit?.billingRule ?? "mep");
  const [startDate, setStartDate] = useState(edit?.startDate ?? "");
  const [endDate, setEndDate] = useState(edit?.endDate ?? "");
  const [status, setStatus] = useState(edit?.status ?? "active");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        isEdit && edit
          ? await updateEngagement({
              accountId,
              id: edit.id,
              neurona: neurona.trim(),
              currency,
              billingRule,
              startDate: startDate || null,
              endDate: endDate || null,
              status,
            })
          : await createEngagement({
              accountId,
              neurona: neurona.trim(),
              currency,
              billingRule,
              startDate: startDate || null,
              endDate: endDate || null,
            });
      if (!result.success) {
        setError(result.error ?? "Error al guardar");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <DialogShell
      title={isEdit ? "Editar engagement" : "Nuevo engagement"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="eng-neurona" className={labelClass}>
            Neurona <span className="text-destructive">*</span>
          </label>
          <input
            id="eng-neurona"
            type="text"
            required
            value={neurona}
            onChange={(e) => setNeurona(e.target.value)}
            placeholder="Ej: Selección, Consultoría…"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="eng-currency" className={labelClass}>
              Moneda
            </label>
            <select
              id="eng-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectClass}
            >
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="eng-rule" className={labelClass}>
              Regla de facturación
            </label>
            <select
              id="eng-rule"
              value={billingRule}
              onChange={(e) => setBillingRule(e.target.value)}
              className={selectClass}
            >
              {BILLING_RULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="eng-start" className={labelClass}>
              Desde
            </label>
            <input
              id="eng-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="eng-end" className={labelClass}>
              Hasta
            </label>
            <input
              id="eng-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {isEdit && (
          <div>
            <label htmlFor="eng-status" className={labelClass}>
              Estado
            </label>
            <select
              id="eng-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              {ENGAGEMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <FormActions isPending={isPending} isEdit={isEdit} onClose={onClose} />
      </form>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// Period dialog
// ---------------------------------------------------------------------------
export interface PeriodData {
  id: string;
  fromDate: string;
  toDate: string | null;
  fee: number;
  currency: string;
}

export function PeriodDialog({
  accountId,
  engagementId,
  defaultCurrency,
  edit,
  onClose,
}: {
  accountId: string;
  engagementId: string;
  defaultCurrency: string;
  edit: PeriodData | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = edit !== null;

  const [fromDate, setFromDate] = useState(edit?.fromDate ?? "");
  const [toDate, setToDate] = useState(edit?.toDate ?? "");
  const [fee, setFee] = useState(edit ? String(edit.fee) : "");
  const [currency, setCurrency] = useState(edit?.currency ?? defaultCurrency);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const feeNum = Number(fee);
    if (!fromDate) {
      setError("La fecha 'desde' es obligatoria");
      return;
    }
    if (Number.isNaN(feeNum)) {
      setError("El fee debe ser un número");
      return;
    }
    startTransition(async () => {
      const result =
        isEdit && edit
          ? await updatePeriod({
              accountId,
              id: edit.id,
              fromDate,
              toDate: toDate || null,
              fee: feeNum,
              currency,
            })
          : await createPeriod({
              accountId,
              engagementId,
              fromDate,
              toDate: toDate || null,
              fee: feeNum,
              currency,
            });
      if (!result.success) {
        setError(result.error ?? "Error al guardar");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <DialogShell title={isEdit ? "Editar período" : "Nuevo período"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="per-from" className={labelClass}>
              Desde <span className="text-destructive">*</span>
            </label>
            <input
              id="per-from"
              type="date"
              required
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="per-to" className={labelClass}>
              Hasta
            </label>
            <input
              id="per-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="per-fee" className={labelClass}>
              Fee <span className="text-destructive">*</span>
            </label>
            <input
              id="per-fee"
              type="number"
              step="0.01"
              required
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="per-currency" className={labelClass}>
              Moneda
            </label>
            <select
              id="per-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectClass}
            >
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <FormActions isPending={isPending} isEdit={isEdit} onClose={onClose} />
      </form>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// Share dialog
// ---------------------------------------------------------------------------
export interface ShareData {
  id: string;
  memberId: string | null;
  consultantNameRaw: string | null;
  shareType: string;
  shareValue: number;
  shareCurrency: string | null;
}

export function ShareDialog({
  accountId,
  engagementId,
  members,
  edit,
  onClose,
}: {
  accountId: string;
  engagementId: string;
  members: FinanceMember[];
  edit: ShareData | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = edit !== null;

  const [memberId, setMemberId] = useState(edit?.memberId ?? "");
  const [consultantNameRaw, setConsultantNameRaw] = useState(
    edit?.consultantNameRaw ?? ""
  );
  const [shareType, setShareType] = useState(edit?.shareType ?? "percent");
  const [shareValue, setShareValue] = useState(edit ? String(edit.shareValue) : "");
  const [shareCurrency, setShareCurrency] = useState(edit?.shareCurrency ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const valueNum = Number(shareValue);
    if (Number.isNaN(valueNum)) {
      setError("El valor debe ser un número");
      return;
    }
    startTransition(async () => {
      const result =
        isEdit && edit
          ? await updateShare({
              accountId,
              id: edit.id,
              shareType,
              shareValue: valueNum,
              shareCurrency: shareCurrency || null,
              memberId: memberId || null,
            })
          : await createShare({
              accountId,
              engagementId,
              memberId: memberId || null,
              consultantNameRaw: consultantNameRaw.trim() || null,
              shareType,
              shareValue: valueNum,
              shareCurrency: shareCurrency || null,
            });
      if (!result.success) {
        setError(result.error ?? "Error al guardar");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <DialogShell title={isEdit ? "Editar share" : "Nuevo share"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="sh-member" className={labelClass}>
            Consultor (miembro)
          </label>
          <select
            id="sh-member"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className={selectClass}
          >
            <option value="">(sin asignar)</option>
            {members.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {!isEdit && (
          <div>
            <label htmlFor="sh-rawname" className={labelClass}>
              Nombre crudo (opcional)
            </label>
            <input
              id="sh-rawname"
              type="text"
              value={consultantNameRaw}
              onChange={(e) => setConsultantNameRaw(e.target.value)}
              placeholder="Nombre tal como figura en los términos"
              className={inputClass}
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="sh-type" className={labelClass}>
              Tipo
            </label>
            <select
              id="sh-type"
              value={shareType}
              onChange={(e) => setShareType(e.target.value)}
              className={selectClass}
            >
              {SHARE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sh-value" className={labelClass}>
              Valor <span className="text-destructive">*</span>
            </label>
            <input
              id="sh-value"
              type="number"
              step="0.01"
              required
              value={shareValue}
              onChange={(e) => setShareValue(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sh-currency" className={labelClass}>
              Moneda
            </label>
            <select
              id="sh-currency"
              value={shareCurrency}
              onChange={(e) => setShareCurrency(e.target.value)}
              className={selectClass}
            >
              <option value="">—</option>
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <FormActions isPending={isPending} isEdit={isEdit} onClose={onClose} />
      </form>
    </DialogShell>
  );
}
