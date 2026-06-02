"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Mail,
  Phone,
  Linkedin,
  Banknote,
  Check,
  ArrowRight,
  X,
  Handshake,
  FileText,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { StarRating } from "@/components/selection/star-rating";
import { isEmbeddableCv, toEmbeddableCvUrl } from "@/lib/selection/cv-url";
import type { PublicAccountSnapshot } from "@/lib/queries/public-account";
import {
  clientSetCandidateStatus,
  clientSaveCandidateFeedback,
  clientGetCandidateCvUrl,
} from "@/app/actions/selection-client";

type Selection = NonNullable<PublicAccountSnapshot["data"]["selection"]>;
type Candidate = Selection["searches"][number]["candidates"][number];

interface Props {
  token: string;
  selection: Selection;
}

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

export function SelectionSection({ token, selection }: Props) {
  const searches = selection.searches;
  const [searchId, setSearchId] = useState<string | null>(
    searches[0]?.id ?? null
  );

  const activeSearch =
    searches.find((s) => s.id === searchId) ?? searches[0] ?? null;

  const [candidateId, setCandidateId] = useState<string | null>(
    activeSearch?.candidates[0]?.id ?? null
  );

  const selectedCandidate = useMemo(() => {
    if (!activeSearch) return null;
    return (
      activeSearch.candidates.find((c) => c.id === candidateId) ??
      activeSearch.candidates[0] ??
      null
    );
  }, [activeSearch, candidateId]);

  if (searches.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-semibold mb-2">Selección</h2>
        <p className="text-sm text-muted-foreground">
          Todavía no hay búsquedas de candidatos para revisar.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold">Selección</h2>
        {searches.length > 1 && (
          <select
            value={activeSearch?.id ?? ""}
            onChange={(e) => {
              setSearchId(e.target.value);
              const next = searches.find((s) => s.id === e.target.value);
              setCandidateId(next?.candidates[0]?.id ?? null);
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {searches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.position} ({s.candidates.length})
              </option>
            ))}
          </select>
        )}
      </div>

      {activeSearch && (
        <p className="text-sm text-muted-foreground -mt-1">
          {activeSearch.position}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
        <CandidateList
          candidates={activeSearch?.candidates ?? []}
          selectedId={selectedCandidate?.id ?? null}
          onSelect={setCandidateId}
        />
        {selectedCandidate ? (
          <CandidateDetail
            key={selectedCandidate.id}
            token={token}
            candidate={selectedCandidate}
          />
        ) : (
          <GlassCard className="flex items-center justify-center p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Selecciona un candidato para ver su detalle.
            </p>
          </GlassCard>
        )}
      </div>
    </GlassCard>
  );
}

function CandidateList({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? candidates.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q)
        );
      })
    : candidates;

  return (
    <GlassCard className="flex flex-col overflow-hidden">
      <div className="p-3 [border-bottom:1px_solid_var(--glass-border)]">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Buscar candidato…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[520px]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
            <Users
              size={24}
              className="text-muted-foreground opacity-40"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              {query.trim()
                ? "Sin resultados para esa búsqueda."
                : "Sin candidatos aún."}
            </p>
          </div>
        ) : (
          <ul role="listbox" aria-label="Candidatos">
            {filtered.map((candidate) => {
              const isSelected = candidate.id === selectedId;
              const statusStyle =
                STATUS_STYLE[candidate.status] ?? STATUS_STYLE.pending;
              const statusLabel =
                STATUS_LABEL[candidate.status] ?? candidate.status;
              return (
                <li
                  key={candidate.id}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(candidate.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors",
                      "[border-bottom:1px_solid_var(--glass-border)]",
                      isSelected
                        ? "[background:var(--glass-bg-strong)]"
                        : "hover:[background:var(--glass-bg-strong)]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium leading-tight line-clamp-1 flex-1">
                        {candidate.firstName} {candidate.lastName}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          statusStyle
                        )}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {candidate.email && (
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {candidate.email}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

type DecisionForm = "advance" | "offer" | "rejected" | null;

function CandidateDetail({
  token,
  candidate,
}: {
  token: string;
  candidate: Candidate;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<DecisionForm>(null);
  const [error, setError] = useState<string | null>(null);

  // Decision form fields
  const [modality, setModality] = useState(candidate.interviewModality ?? "");
  const [schedule, setSchedule] = useState(candidate.interviewSchedule ?? "");
  const [conditions, setConditions] = useState(candidate.offerConditions ?? "");
  const [reason, setReason] = useState(candidate.rejectionReason ?? "");

  const statusStyle = STATUS_STYLE[candidate.status] ?? STATUS_STYLE.pending;
  const statusLabel = STATUS_LABEL[candidate.status] ?? candidate.status;

  function submitDecision(status: "advance" | "offer" | "rejected") {
    setError(null);
    if (status === "rejected" && !reason.trim()) {
      setError("El motivo de rechazo es obligatorio.");
      return;
    }
    startTransition(async () => {
      const result = await clientSetCandidateStatus({
        token,
        candidateId: candidate.id,
        status,
        interviewModality: status === "advance" ? modality : undefined,
        interviewSchedule: status === "advance" ? schedule : undefined,
        offerConditions: status === "offer" ? conditions : undefined,
        rejectionReason: status === "rejected" ? reason : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "No se pudo guardar la decisión.");
        return;
      }
      setForm(null);
      router.refresh();
    });
  }

  return (
    <GlassCard className="flex flex-col overflow-hidden">
      <div className="p-4 space-y-4">
        {/* 1. Decision actions — TOP, prominent */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tu decisión
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                statusStyle
              )}
            >
              {statusLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setForm(form === "advance" ? null : "advance");
              }}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
                form === "advance"
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
              )}
            >
              <ArrowRight size={16} />
              Avanzar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setForm(form === "rejected" ? null : "rejected");
              }}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
                form === "rejected"
                  ? "bg-rose-600 text-white"
                  : "bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:text-rose-300"
              )}
            >
              <X size={16} />
              Rechazar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setForm(form === "offer" ? null : "offer");
              }}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
                form === "offer"
                  ? "bg-sky-600 text-white"
                  : "bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 dark:text-sky-300"
              )}
            >
              <Handshake size={16} />
              Hacer oferta
            </button>
          </div>

          {form && (
            <div className="rounded-lg p-3 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)] space-y-3">
              {form === "advance" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Modalidad</label>
                    <select
                      value={modality}
                      onChange={(e) => setModality(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Seleccionar…</option>
                      <option value="Presencial">Presencial</option>
                      <option value="Virtual">Virtual</option>
                      <option value="Híbrida">Híbrida</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Horarios</label>
                    <input
                      type="text"
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      placeholder="Ej. Lunes a viernes, 10–12h"
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </>
              )}
              {form === "offer" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Condiciones</label>
                  <textarea
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    rows={3}
                    placeholder="Detalle de la oferta…"
                    className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              )}
              {form === "rejected" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">
                    Motivo <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Indica por qué se descarta…"
                    className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submitDecision(form)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Confirmar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setForm(null);
                    setError(null);
                  }}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle size={13} />
              {error}
            </p>
          )}
        </div>

        {/* 2. Identity row */}
        <div className="[border-top:1px_solid_var(--glass-border)] pt-4 space-y-2">
          <h3 className="text-lg font-semibold">
            {candidate.firstName} {candidate.lastName}
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {candidate.email && (
              <a
                href={`mailto:${candidate.email}`}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Mail size={12} />
                {candidate.email}
              </a>
            )}
            {candidate.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={12} />
                {candidate.phone}
              </span>
            )}
            {candidate.linkedinUrl && (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Linkedin size={12} />
                LinkedIn
              </a>
            )}
            {candidate.expectedSalary && (
              <span className="inline-flex items-center gap-1.5">
                <Banknote size={12} />
                Remuneración pretendida: {candidate.expectedSalary}
              </span>
            )}
          </div>
        </div>

        {/* 3. CV / Informe viewer — centerpiece */}
        <CvReportViewer token={token} candidate={candidate} />

        {/* 4. Feedback */}
        <FeedbackBlock token={token} candidate={candidate} />
      </div>
    </GlassCard>
  );
}

type ViewerTab = "cv" | "report";

function CvReportViewer({
  token,
  candidate,
}: {
  token: string;
  candidate: Candidate;
}) {
  const [tab, setTab] = useState<ViewerTab>(
    candidate.hasCv ? "cv" : "report"
  );
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (tab !== "cv" || !candidate.hasCv || cvUrl) return;
    setCvLoading(true);
    setCvError(null);
    clientGetCandidateCvUrl({ token, candidateId: candidate.id }).then(
      (res) => {
        if (cancelled) return;
        setCvLoading(false);
        if (res.url) setCvUrl(res.url);
        else setCvError(res.error ?? "No se pudo cargar el CV.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [tab, candidate.hasCv, candidate.id, token, cvUrl]);

  const reportReady =
    candidate.reportStatus === "ready" && !!candidate.reportContent;

  return (
    <div className="[border-top:1px_solid_var(--glass-border)] pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          {(
            [
              { k: "cv" as const, label: "CV" },
              { k: "report" as const, label: "Informe" },
            ]
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                tab === t.k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText size={12} />
              {t.label}
            </button>
          ))}
        </div>
        {tab === "cv" && cvUrl && (
          <a
            href={cvUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink size={12} />
            Abrir en pestaña nueva
          </a>
        )}
      </div>

      <div className="rounded-lg overflow-hidden [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]">
        {tab === "cv" ? (
          !candidate.hasCv ? (
            <div className="flex items-center justify-center min-h-[460px] text-sm text-muted-foreground">
              Sin CV disponible
            </div>
          ) : cvLoading ? (
            <div className="flex items-center justify-center min-h-[460px] text-sm text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin" />
              Cargando CV…
            </div>
          ) : cvError ? (
            <div className="flex items-center justify-center min-h-[460px] text-sm text-rose-600 dark:text-rose-400 gap-2 px-4 text-center">
              <AlertCircle size={16} />
              {cvError}
            </div>
          ) : cvUrl && isEmbeddableCv(cvUrl, null) ? (
            <iframe
              src={toEmbeddableCvUrl(cvUrl)}
              title="CV del candidato"
              className="w-full h-[460px] bg-white"
            />
          ) : cvUrl ? (
            <div className="flex flex-col items-center justify-center gap-2 min-h-[460px] px-4 text-center text-sm text-muted-foreground">
              <FileText size={22} className="opacity-50" />
              Vista previa no disponible. Usá “Abrir en pestaña nueva”.
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[460px] text-sm text-muted-foreground">
              Sin CV disponible
            </div>
          )
        ) : reportReady ? (
          <div className="min-h-[460px] max-h-[600px] overflow-y-auto p-4 text-sm">
            <RichMarkdown text={candidate.reportContent ?? ""} />
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[460px] text-sm text-muted-foreground">
            Informe no disponible aún
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackBlock({
  token,
  candidate,
}: {
  token: string;
  candidate: Candidate;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(candidate.clientRating ?? 0);
  const [notes, setNotes] = useState(candidate.clientNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await clientSaveCandidateFeedback({
        token,
        candidateId: candidate.id,
        clientNotes: notes,
        clientRating: rating,
      });
      if (!result.success) {
        setError(result.error ?? "No se pudo guardar tu feedback.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="[border-top:1px_solid_var(--glass-border)] pt-4 space-y-3">
      <h4 className="text-sm font-semibold">Tu feedback</h4>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Calificación
        </label>
        <StarRating value={rating} onChange={setRating} />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Notas
        </label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="Comparte tu impresión sobre este candidato…"
          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Guardar
        </button>
        {saved && !pending && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Guardado
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle size={13} />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
