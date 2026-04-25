"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { setWorkspaceAgencyContext } from "@/app/actions/workspace";

interface Props {
  initialValue: string | null;
  canManage: boolean;
}

const PLACEHOLDER = `Ej: Somos una agencia de growth con foco en SaaS B2B en LATAM. Trabajamos con empresas Series A+ que ya tienen producto y necesitan escalar adquisición. Nuestro diferencial es combinar paid media con experimentación en producto.

Cosas que nos sirve saber del cliente: en qué etapa está (validación, escala, optimización), si tiene equipo interno o terceriza todo, qué herramientas usa hoy.

(La cartera de servicios la cargás aparte — la IA la usa para sugerir cross-sell automáticamente cuando el cliente menciona problemas que podemos resolver.)`;

export function WorkspaceAgencyContextSection({
  initialValue,
  canManage,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setWorkspaceAgencyContext(value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
      setTimeout(() => setSavedAt(null), 1500);
    });
  }

  const dirty = (value ?? "") !== (initialValue ?? "");
  const charCount = value.length;

  return (
    <section className="rounded-xl p-6 backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
      <div className="flex items-start gap-2 mb-1">
        <Sparkles size={16} className="text-primary mt-0.5 shrink-0" aria-hidden />
        <div>
          <h2 className="font-semibold">Contexto de la agencia</h2>
          <p className="text-xs text-muted-foreground">
            Background sobre quién es tu agencia y qué tipo de cliente buscás.
            La IA combina esto con tu cartera de servicios para inferir
            señales de upsell y cross-sell — no hace falta que pongas reglas
            literales.
          </p>
        </div>
      </div>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={10}
        disabled={!canManage || pending}
        placeholder={PLACEHOLDER}
        className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y disabled:opacity-60"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {charCount.toLocaleString()} / 4.000 caracteres
        </p>
        {canManage && (
          <div className="flex items-center gap-2">
            {savedAt !== null && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                Guardado
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
