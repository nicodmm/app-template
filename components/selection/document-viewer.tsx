"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, FileWarning } from "lucide-react";
import { getCandidateCvUrl, getCandidateReportUrl } from "@/app/actions/selection";
import { GlassCard } from "@/components/ui/glass-card";
import { RichMarkdown } from "@/components/ui/rich-markdown";
import { cn } from "@/lib/utils";
import { isEmbeddableCv, toEmbeddableCvUrl } from "@/lib/selection/cv-url";
import type { SelectionCandidate } from "@/lib/drizzle/schema";

interface Props {
  accountId: string;
  candidate: SelectionCandidate;
}

type Tab = "cv" | "report";

export function DocumentViewer({ accountId, candidate }: Props) {
  const [tab, setTab] = useState<Tab>("cv");
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvFetched, setCvFetched] = useState(false);

  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportErrorMsg, setReportErrorMsg] = useState<string | null>(null);
  const [reportFetched, setReportFetched] = useState(false);

  const hasCv = Boolean(candidate.cvStoragePath || candidate.cvUrl);
  const hasReportFile = Boolean(candidate.reportStoragePath);

  // Fetch the signed/external URL the first time the CV tab is active.
  useEffect(() => {
    if (tab !== "cv" || cvFetched || !hasCv) return;
    let cancelled = false;
    setCvLoading(true);
    setCvError(null);
    void getCandidateCvUrl({ accountId, candidateId: candidate.id }).then((res) => {
      if (cancelled) return;
      setCvFetched(true);
      setCvLoading(false);
      if (res.error) {
        setCvError(res.error);
        return;
      }
      setCvUrl(res.url);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, cvFetched, hasCv, accountId, candidate.id]);

  // Reset cached URL when the candidate (or its CV) changes.
  useEffect(() => {
    setCvFetched(false);
    setCvUrl(null);
    setCvError(null);
  }, [candidate.id, candidate.cvStoragePath, candidate.cvUrl]);

  // Fetch the signed URL the first time the report tab is active and a file exists.
  useEffect(() => {
    if (tab !== "report" || reportFetched || !hasReportFile) return;
    let cancelled = false;
    setReportLoading(true);
    setReportErrorMsg(null);
    void getCandidateReportUrl({ accountId, candidateId: candidate.id }).then((res) => {
      if (cancelled) return;
      setReportFetched(true);
      setReportLoading(false);
      if (res.error) {
        setReportErrorMsg(res.error);
        return;
      }
      setReportUrl(res.url);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, reportFetched, hasReportFile, accountId, candidate.id]);

  useEffect(() => {
    setReportFetched(false);
    setReportUrl(null);
    setReportErrorMsg(null);
  }, [candidate.id, candidate.reportStoragePath]);

  return (
    <GlassCard variant="strong" className="flex flex-col overflow-hidden">
      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Documentos del candidato"
        className="flex items-center gap-1 p-2 [border-bottom:1px_solid_var(--glass-border)]"
      >
        <TabButton active={tab === "cv"} onClick={() => setTab("cv")}>
          <FileText size={14} aria-hidden />
          CV
        </TabButton>
        <TabButton active={tab === "report"} onClick={() => setTab("report")}>
          <FileText size={14} aria-hidden />
          Informe
        </TabButton>
      </div>

      {/* CV tab */}
      {tab === "cv" && (
        <div className="min-h-[480px] flex flex-col">
          {!hasCv ? (
            <EmptyState icon={<FileText size={28} aria-hidden />} text="Sin CV cargado" />
          ) : cvLoading ? (
            <EmptyState text="Cargando CV…" />
          ) : cvError ? (
            <EmptyState
              icon={<FileWarning size={28} aria-hidden />}
              text={cvError}
            />
          ) : cvUrl && isEmbeddableCv(cvUrl, candidate.cvMimeType) ? (
            <iframe
              src={toEmbeddableCvUrl(cvUrl)}
              title={candidate.cvFileName ?? "CV"}
              className="w-full h-[480px] flex-1 border-0"
            />
          ) : cvUrl ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center min-h-[480px]">
              <FileText size={28} className="text-muted-foreground opacity-50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Este archivo no se puede previsualizar.
              </p>
              <a
                href={cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
              >
                Abrir CV
                <ExternalLink size={14} aria-hidden />
              </a>
            </div>
          ) : (
            <EmptyState icon={<FileText size={28} aria-hidden />} text="Sin CV cargado" />
          )}
        </div>
      )}

      {/* Informe tab */}
      {tab === "report" &&
        (candidate.reportStatus === "generating" ? (
          <div className="min-h-[480px] flex flex-col">
            <EmptyState text="Generando informe…" />
          </div>
        ) : candidate.reportStatus === "error" ? (
          <div className="min-h-[480px] flex flex-col">
            <EmptyState
              icon={<FileWarning size={28} aria-hidden />}
              text={candidate.reportError ?? "Error al generar el informe"}
            />
          </div>
        ) : hasReportFile ? (
          // Informe subido como archivo → mostrar el original (como el CV).
          <div className="min-h-[480px] flex flex-col">
            {reportLoading ? (
              <EmptyState text="Cargando informe…" />
            ) : reportErrorMsg ? (
              <EmptyState icon={<FileWarning size={28} aria-hidden />} text={reportErrorMsg} />
            ) : reportUrl && isEmbeddableCv(reportUrl, candidate.reportMimeType) ? (
              <iframe
                src={toEmbeddableCvUrl(reportUrl)}
                title={candidate.reportFileName ?? "Informe"}
                className="w-full h-[480px] flex-1 border-0"
              />
            ) : reportUrl ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center min-h-[480px]">
                <FileText size={28} className="text-muted-foreground opacity-50" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Este archivo no se puede previsualizar.
                </p>
                <a
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
                >
                  Abrir informe
                  <ExternalLink size={14} aria-hidden />
                </a>
              </div>
            ) : (
              <EmptyState icon={<FileText size={28} aria-hidden />} text="Sin informe" />
            )}
          </div>
        ) : candidate.reportStatus === "ready" && candidate.reportContent ? (
          // Informe generado/editado → markdown.
          <div className="min-h-[480px] max-h-[640px] overflow-y-auto p-6">
            <div className="text-sm leading-relaxed">
              <RichMarkdown text={candidate.reportContent} />
            </div>
          </div>
        ) : (
          <div className="min-h-[480px] flex flex-col">
            <EmptyState icon={<FileText size={28} aria-hidden />} text="Informe no generado aún" />
          </div>
        ))}
    </GlassCard>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "[background:var(--glass-bg-strong)] text-foreground"
          : "text-muted-foreground hover:text-foreground hover:[background:var(--glass-bg)]"
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center min-h-[480px]">
      {icon && <span className="text-muted-foreground opacity-50">{icon}</span>}
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
