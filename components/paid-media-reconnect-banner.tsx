import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function PaidMediaReconnectBanner() {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 flex items-center gap-2">
      <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">Reconectar Meta</p>
        <p className="text-xs text-muted-foreground">
          El token expiró. Los datos de paid media no se están actualizando.
        </p>
      </div>
      <Link
        href="/api/auth/meta/login"
        className="shrink-0 inline-flex items-center rounded-md bg-red-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-red-700 transition-colors"
      >
        Reconectar
      </Link>
    </div>
  );
}
