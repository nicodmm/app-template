"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { AdAccountMappingForm } from "@/components/ad-account-mapping-form";
import { BackfillButton } from "@/components/backfill-button";
import { disconnectMetaConnection } from "@/app/actions/meta-connections";

export interface MetaAdAccountView {
  id: string;
  accountId: string | null;
  metaAdAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  isEcommerce: boolean;
  conversionEvent: string;
  lastSyncedAt: Date | null;
}

interface Props {
  connectionId: string;
  metaLabel: string;
  status: string;
  tokenExpiresAt: Date | null;
  ownerName: string | null;
  adAccounts: MetaAdAccountView[];
  planiAccounts: Array<{ id: string; name: string }>;
}

export function MetaConnectionCard({
  connectionId,
  metaLabel,
  status,
  tokenExpiresAt,
  ownerName,
  adAccounts,
  planiAccounts,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <BarChart3 size={15} className="text-primary shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium truncate">{metaLabel}</span>
            <span className="block text-xs text-muted-foreground">
              {adAccounts.length} ad account{adAccounts.length === 1 ? "" : "s"}
              {" · "}Estado: {status}
              {tokenExpiresAt && (
                <> · Expira {new Date(tokenExpiresAt).toLocaleDateString("es-AR")}</>
              )}
              {ownerName && <> · conectado por {ownerName}</>}
            </span>
          </span>
        </button>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/api/auth/meta/login"
            className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
          >
            Reconectar
          </Link>
          <DeleteButton
            action={() => disconnectMetaConnection(connectionId)}
            confirmMessage="¿Desconectar Meta? Se eliminarán todos los ad accounts vinculados."
            className="inline-flex items-center rounded-md border border-destructive/30 text-destructive px-2.5 py-1 text-xs font-medium hover:bg-destructive/10 transition-colors"
          >
            Desconectar
          </DeleteButton>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {adAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta conexión no tiene ad accounts sincronizados todavía.
            </p>
          ) : (
            adAccounts.map((aa) => (
              <div
                key={aa.id}
                className="rounded-lg p-3 space-y-2 [background:var(--glass-tile-bg)] [border:1px_solid_var(--glass-tile-border)]"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">{aa.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {aa.metaAdAccountId} · {aa.currency} · {aa.timezone}
                      {aa.lastSyncedAt && (
                        <> · última sync {new Date(aa.lastSyncedAt).toLocaleString("es-AR")}</>
                      )}
                    </p>
                  </div>
                  {aa.accountId && <BackfillButton adAccountId={aa.id} />}
                </div>
                <AdAccountMappingForm
                  adAccountId={aa.id}
                  currentAccountId={aa.accountId}
                  currentIsEcommerce={aa.isEcommerce}
                  currentConversionEvent={aa.conversionEvent}
                  planiAccounts={planiAccounts}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
