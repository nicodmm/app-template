import Link from "next/link";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingState } from "@/lib/queries/onboarding";

interface OnboardingChecklistProps {
  state: OnboardingState;
  /**
   * Compact mode collapses to a single inline strip. Used once the user has
   * at least one account — the full checklist would feel intrusive at that
   * point. The full mode is reserved for fresh workspaces with zero accounts.
   */
  compact?: boolean;
}

interface StepConfig {
  key: keyof OnboardingState["steps"];
  title: string;
  /** Lower-case action phrase used in the compact one-liner. */
  shortTitle: string;
  description: string;
  hrefForState: (s: OnboardingState) => string;
}

const STEPS: StepConfig[] = [
  {
    key: "agency",
    title: "Configurá tu agencia",
    shortTitle: "configurar agencia",
    description:
      "El AI usa este contexto para generar señales más precisas para cada cliente.",
    hrefForState: () => "/app/settings/workspace#agency-context",
  },
  {
    key: "services",
    title: "Definí tus servicios",
    shortTitle: "definir servicios",
    description:
      "El catálogo se usa para etiquetar cuentas y filtrar el dashboard.",
    hrefForState: () => "/app/settings/workspace#services",
  },
  {
    key: "account",
    title: "Creá tu primera cuenta",
    shortTitle: "crear primera cuenta",
    description:
      "Cada cuenta representa un cliente. Podés crearlas una por una o importar un CSV.",
    hrefForState: () => "/app/accounts/new",
  },
  {
    key: "context",
    title: "Subí tu primer contexto",
    shortTitle: "subir un contexto",
    description:
      "Una transcripción o archivo de reunión dispara el análisis del AI.",
    hrefForState: (s) =>
      s.latestAccountId
        ? `/app/accounts/${s.latestAccountId}`
        : "/app/portfolio",
  },
];

/**
 * Top-of-portfolio checklist for owners/admins. Returns null when complete
 * so the checklist self-removes once setup is done. In `compact` mode it
 * renders a single-line strip with the pending step titles as inline links,
 * suitable for users that already have accounts and don't need the
 * walkthrough panel anymore.
 */
export function OnboardingChecklist({
  state,
  compact = false,
}: OnboardingChecklistProps) {
  if (state.isComplete) return null;

  if (compact) {
    const pending = STEPS.filter((s) => !state.steps[s.key]);
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-2.5 text-sm backdrop-blur-[14px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] ring-1 ring-primary/10">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Sparkles size={14} className="text-primary" aria-hidden />
          <span>
            <span className="font-medium tabular-nums text-foreground">
              {state.completedCount}/4
            </span>{" "}
            del setup completado
          </span>
        </span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="text-muted-foreground">Te falta:</span>
        {pending.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <Link
              href={s.hrefForState(state)}
              className="font-medium text-primary hover:underline"
            >
              {s.shortTitle}
            </Link>
            {i < pending.length - 1 && (
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    );
  }

  const progressPct = (state.completedCount / 4) * 100;

  return (
    <section
      aria-label="Checklist de onboarding"
      className="rounded-xl p-5 backdrop-blur-[18px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)] ring-1 ring-primary/15"
    >
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles size={14} aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Bienvenido a nao.fyi</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Completá estos pasos para que el AI te dé mejores resultados.
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {state.completedCount} de 4
        </span>
      </header>

      <div className="mb-4 h-1.5 rounded-full bg-white/30 dark:bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {STEPS.map((step) => {
          const done = state.steps[step.key];
          return (
            <li
              key={step.key}
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
                done
                  ? "[background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
                  : "[border:1px_solid_var(--glass-tile-border)] hover:bg-white/30 dark:hover:bg-white/5"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                  done
                    ? "bg-success text-success-foreground"
                    : "[border:1.5px_solid_var(--glass-border)]"
                )}
              >
                {done && <Check size={12} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    done && "text-muted-foreground line-through decoration-1"
                  )}
                >
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              </div>
              {!done && (
                <Link
                  href={step.hrefForState(state)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  Ir
                  <ChevronRight size={12} aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
