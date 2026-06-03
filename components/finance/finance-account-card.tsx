import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { FinanceAccountCard as CardData } from "@/lib/queries/finance";

function Alert({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400">
      <AlertTriangle size={11} aria-hidden />
      {label}
    </span>
  );
}

export function FinanceAccountCard({ account }: { account: CardData }) {
  const alerts: string[] = [];
  if (!account.hasNda) alerts.push("Falta NDA");
  if (!account.hasBillingData) alerts.push("Faltan datos de facturación");
  if (account.hasTermsText && account.termsStatus !== "ready")
    alerts.push("Términos sin estructurar");

  return (
    <Link href={`/app/finanzas/${account.id}`} className="block">
      <GlassCard className="p-5 h-full transition-colors hover:bg-white/30 dark:hover:bg-white/5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{account.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {account.ownerName ?? "Sin responsable"}
            </p>
          </div>
          {account.fee != null && (
            <span className="shrink-0 text-sm font-medium tabular-nums">
              USD {account.fee.toLocaleString("es-AR")}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {alerts.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={11} aria-hidden />
              Completo
            </span>
          ) : (
            alerts.map((a) => <Alert key={a} label={a} />)
          )}
        </div>
      </GlassCard>
    </Link>
  );
}
