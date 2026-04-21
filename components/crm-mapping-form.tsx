"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCrmMapping, disconnectCrmConnection } from "@/app/actions/crm";
import type { CrmCustomField } from "@/lib/crm/types";

interface Pipeline {
  id: string;
  externalId: string;
  name: string;
  isSynced: boolean;
  stages: {
    id: string;
    externalId: string;
    name: string;
    orderNr: number;
    isSynced: boolean;
    isProposalStage: boolean;
  }[];
}

interface Props {
  accountId: string;
  connectionId: string;
  pipelines: Pipeline[];
  customFields: CrmCustomField[];
  sourceConfig: { sourceFieldType: "channel" | "custom"; sourceFieldKey: string } | null;
}

export function CrmMappingForm({
  accountId,
  connectionId,
  pipelines,
  customFields,
  sourceConfig,
}: Props) {
  const router = useRouter();
  const [pipelineIds, setPipelineIds] = useState<Set<string>>(
    new Set(pipelines.filter((p) => p.isSynced).map((p) => p.id))
  );
  const [stageIds, setStageIds] = useState<Set<string>>(
    new Set(pipelines.flatMap((p) => p.stages.filter((s) => s.isSynced).map((s) => s.id)))
  );
  const [proposalByPipeline, setProposalByPipeline] = useState<Record<string, string>>(
    () => {
      const out: Record<string, string> = {};
      for (const p of pipelines) {
        const s = p.stages.find((x) => x.isProposalStage);
        if (s) out[p.id] = s.id;
      }
      return out;
    }
  );
  const [sourceFieldType, setSourceFieldType] = useState<"channel" | "custom">(
    sourceConfig?.sourceFieldType ?? "channel"
  );
  const [customFieldKey, setCustomFieldKey] = useState<string>(
    sourceConfig?.sourceFieldType === "custom" ? sourceConfig.sourceFieldKey : customFields[0]?.key ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);

  const selectedPipelines = useMemo(
    () => pipelines.filter((p) => pipelineIds.has(p.id)),
    [pipelines, pipelineIds]
  );

  function togglePipeline(id: string) {
    const next = new Set(pipelineIds);
    if (next.has(id)) {
      next.delete(id);
      // Remove its stages from selected too
      const pipeline = pipelines.find((p) => p.id === id);
      if (pipeline) {
        const nextStages = new Set(stageIds);
        pipeline.stages.forEach((s) => nextStages.delete(s.id));
        setStageIds(nextStages);
      }
      // Clear proposal stage for this pipeline
      const nextProposals = { ...proposalByPipeline };
      delete nextProposals[id];
      setProposalByPipeline(nextProposals);
    } else {
      next.add(id);
    }
    setPipelineIds(next);
  }

  function toggleStage(id: string) {
    const next = new Set(stageIds);
    if (next.has(id)) {
      next.delete(id);
      // If this stage was the proposal stage for its pipeline, clear it
      const pipelineId = pipelines.find((p) => p.stages.some((s) => s.id === id))?.id;
      if (pipelineId && proposalByPipeline[pipelineId] === id) {
        const nextProposals = { ...proposalByPipeline };
        delete nextProposals[pipelineId];
        setProposalByPipeline(nextProposals);
      }
    } else {
      next.add(id);
    }
    setStageIds(next);
  }

  function setProposalStage(pipelineId: string, stageId: string | null) {
    const nextProposals = { ...proposalByPipeline };
    if (stageId === null) {
      delete nextProposals[pipelineId];
    } else {
      nextProposals[pipelineId] = stageId;
    }
    setProposalByPipeline(nextProposals);
  }

  function save() {
    startTransition(async () => {
      const sourceFieldKey = sourceFieldType === "channel" ? "channel" : customFieldKey;
      const res = await updateCrmMapping({
        connectionId,
        syncedPipelineIds: Array.from(pipelineIds),
        syncedStageIds: Array.from(stageIds),
        proposalStageIds: Object.values(proposalByPipeline),
        sourceFieldType,
        sourceFieldKey,
      });
      if (res.triggeredBackfill) {
        setSyncing(true);
        setTimeout(() => setSyncing(false), 15000);
      }
      router.refresh();
    });
  }

  async function disconnect() {
    if (!confirm("¿Desconectar CRM? Esto borra todos los deals sincronizados de este cliente.")) return;
    startTransition(async () => {
      await disconnectCrmConnection(connectionId);
      router.push(`/app/accounts/${accountId}/crm`);
    });
  }

  const canSave = pipelineIds.size > 0 && (sourceFieldType === "channel" || customFieldKey !== "");

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Pipelines a sincronizar</h2>
          <button
            type="button"
            onClick={disconnect}
            className="text-xs text-destructive hover:underline"
            disabled={isPending}
          >
            Desconectar
          </button>
        </div>
        <div className="space-y-1">
          {pipelines.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pipelineIds.has(p.id)}
                onChange={() => togglePipeline(p.id)}
                disabled={isPending}
              />
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                ({p.stages.length} stages)
              </span>
            </label>
          ))}
        </div>
      </section>

      {selectedPipelines.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-1">Stages a sincronizar</h2>
          <p className="text-xs text-muted-foreground mb-2">
            La selección aplica solo a deals abiertos. Los deals ganados del pipeline seleccionado se traen siempre.
          </p>
          {selectedPipelines.map((p) => (
            <div key={p.id} className="mb-3">
              <div className="text-xs font-medium mb-1">{p.name}</div>
              <div className="space-y-1 pl-4">
                {p.stages.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={stageIds.has(s.id)}
                      onChange={() => toggleStage(s.id)}
                      disabled={isPending}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {selectedPipelines.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-1">Stage de propuesta (opcional)</h2>
          <p className="text-xs text-muted-foreground mb-2">
            Marcá el stage que representa &ldquo;propuesta enviada&rdquo; en cada pipeline. Se usa para el KPI de Propuestas en el resumen del cliente.
          </p>
          {selectedPipelines.map((p) => {
            const syncedStages = p.stages.filter((s) => stageIds.has(s.id));
            return (
              <div key={p.id} className="mb-3">
                <div className="text-xs font-medium mb-1">{p.name}</div>
                <div className="space-y-1 pl-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`proposal-${p.id}`}
                      checked={!proposalByPipeline[p.id]}
                      onChange={() => setProposalStage(p.id, null)}
                      disabled={isPending}
                    />
                    <span className="text-muted-foreground">Ninguno</span>
                  </label>
                  {syncedStages.length === 0 && (
                    <p className="text-xs text-muted-foreground italic pl-4">
                      Seleccioná stages arriba para elegir uno como propuesta.
                    </p>
                  )}
                  {syncedStages.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`proposal-${p.id}`}
                        checked={proposalByPipeline[p.id] === s.id}
                        onChange={() => setProposalStage(p.id, s.id)}
                        disabled={isPending}
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium mb-2">Campo de fuente</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="sourceFieldType"
              checked={sourceFieldType === "channel"}
              onChange={() => setSourceFieldType("channel")}
              disabled={isPending}
            />
            <span>channel (estándar de Pipedrive)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="sourceFieldType"
              checked={sourceFieldType === "custom"}
              onChange={() => setSourceFieldType("custom")}
              disabled={isPending || customFields.length === 0}
            />
            <span>Custom field:</span>
            <select
              value={customFieldKey}
              onChange={(e) => setCustomFieldKey(e.target.value)}
              disabled={sourceFieldType !== "custom" || isPending}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              {customFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando..." : "Guardar y sincronizar"}
        </button>
        {syncing && (
          <span className="text-xs text-muted-foreground">
            Sincronizando — puede tardar unos minutos; la página se actualizará sola.
          </span>
        )}
      </div>
    </div>
  );
}
