"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import {
  addAccountConsultant,
  removeAccountConsultant,
} from "@/app/actions/finance";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface Consultant {
  id: string;
  displayName: string;
}

interface Props {
  accountId: string;
  consultants: Consultant[];
  members: WorkspaceMemberWithUser[];
}

export function AccountConsultantsInline({
  accountId,
  consultants,
  members,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await addAccountConsultant({
        accountId,
        userId: selected,
        neurona: null,
        roleLabel: null,
      });
      if (!res.success) setError(res.error ?? "Error");
      else {
        setSelected("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeAccountConsultant({ accountId, id });
      if (!res.success) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Consultores
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {consultants.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary"
          >
            {c.displayName}
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={isPending}
              aria-label={`Quitar ${c.displayName}`}
              className="hover:text-destructive disabled:opacity-50"
            >
              <Trash2 size={11} aria-hidden />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={isPending}
            className="rounded-md border px-2 py-1 text-xs bg-transparent [border-color:var(--glass-border)] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            aria-label="Agregar consultor"
          >
            <option value="">— Agregar —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={isPending || !selected}
            aria-label="Agregar consultor"
            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <UserPlus size={13} aria-hidden />
          </button>
        </span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
