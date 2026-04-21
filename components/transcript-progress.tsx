"use client";

import { useEffect, useState } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const STEPS = [
  { key: "prepare", label: "Procesando texto", threshold: 10 },
  { key: "participants", label: "Identificando participantes", threshold: 25 },
  { key: "tasks", label: "Extrayendo tareas", threshold: 50 },
  { key: "summary", label: "Generando resumen", threshold: 65 },
  { key: "signals", label: "Detectando señales", threshold: 85 },
  { key: "finalize", label: "Finalizando", threshold: 100 },
] as const;

interface TranscriptProgressProps {
  runId: string;
  accountId: string;
  onComplete?: () => void;
  hideWhenComplete?: boolean;
}

export function TranscriptProgress({ runId, accountId, onComplete, hideWhenComplete }: TranscriptProgressProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/trigger-token?runId=${runId}`)
      .then((r) => r.json())
      .then((data: { token?: string }) => {
        if (data.token) setAccessToken(data.token);
      })
      .catch(console.error);
  }, [runId]);

  const { run } = useRealtimeRun(runId, {
    enabled: !!accessToken,
    accessToken: accessToken ?? "",
  });

  const progress = (run?.metadata?.progress as number | undefined) ?? 0;
  const currentStep = (run?.metadata?.currentStep as string | undefined) ?? "Iniciando...";
  const status = run?.status;

  useEffect(() => {
    if (status === "COMPLETED") {
      router.refresh();
      const t = setTimeout(() => {
        onComplete?.();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [status, router, onComplete]);

  if (status === "COMPLETED") {
    if (hideWhenComplete) return null;
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-5">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle size={18} />
          <span className="text-sm font-medium">Transcripción procesada exitosamente</span>
        </div>
      </div>
    );
  }

  if (status === "FAILED" || status === "CRASHED" || status === "SYSTEM_FAILURE" || status === "TIMED_OUT") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">Error al procesar la transcripción</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          Podés reintentar desde el historial de transcripciones.
        </p>
      </div>
    );
  }

  if (status === "EXPIRED") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-5">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">El procesamiento expiró</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          El worker no estaba activo. Asegurate de tener el worker corriendo y reintentá desde el historial.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-primary" />
        <span className="text-sm font-medium">Procesando transcripción...</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{currentStep}</p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-3 gap-2">
        {STEPS.map((step) => {
          const done = progress >= step.threshold;
          const active = !done && progress >= step.threshold - 15;
          return (
            <div
              key={step.key}
              className={`text-xs rounded-md px-2 py-1.5 text-center transition-colors ${
                done
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {done ? "✓ " : ""}{step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
