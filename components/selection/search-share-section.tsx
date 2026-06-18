"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSearchShareLink,
  setSearchShareActive,
  setSearchSharePassword,
} from "@/app/actions/selection";
import { GlassCard } from "@/components/ui/glass-card";

interface Props {
  accountId: string;
  searchId: string;
  initial: {
    token: string | null;
    isActive: boolean;
    hasPassword: boolean;
    viewCount: number;
  };
}

export function SearchShareSection({
  accountId,
  searchId,
  initial,
}: Props): React.ReactElement {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pwd, setPwd] = useState("");
  const url = initial.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/cs/${initial.token}`
    : null;

  return (
    <GlassCard className="p-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Compartir esta búsqueda</h3>
      {!initial.token ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await createSearchShareLink({ accountId, searchId });
              router.refresh();
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:bg-primary/90 disabled:opacity-50"
        >
          Generar link público
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url ?? ""}
              className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => url && navigator.clipboard.writeText(url)}
              className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
            >
              Copiar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {initial.viewCount} vista{initial.viewCount === 1 ? "" : "s"} &middot;{" "}
            {initial.isActive ? "Activo" : "Desactivado"}
            {initial.hasPassword ? " · con contraseña" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setSearchShareActive({
                    accountId,
                    searchId,
                    isActive: !initial.isActive,
                  });
                  router.refresh();
                })
              }
              className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {initial.isActive ? "Desactivar" : "Activar"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder={
                initial.hasPassword ? "Nueva contraseña" : "Contraseña (opcional)"
              }
              className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setSearchSharePassword({
                    accountId,
                    searchId,
                    password: pwd.trim() || null,
                  });
                  setPwd("");
                  router.refresh();
                })
              }
              className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {initial.hasPassword ? "Cambiar" : "Poner"}
            </button>
            {initial.hasPassword && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await setSearchSharePassword({
                      accountId,
                      searchId,
                      password: null,
                    });
                    router.refresh();
                  })
                }
                className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                Quitar
              </button>
            )}
          </div>
        </>
      )}
    </GlassCard>
  );
}
