"use client";

import { useState, useTransition } from "react";
import { Copy, RefreshCw, Trash2, Check, Eye } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import {
  createShareLink,
  updateShareConfig,
  setSharePassword,
  regenerateShareToken,
  toggleShareLinkActive,
  deleteShareLink,
} from "@/app/actions/share-links";
import {
  DEFAULT_SHARE_CONFIG,
  SHARE_CONFIG_LABELS,
  type ShareConfig,
} from "@/lib/share/share-config";

interface ExistingLink {
  id: string;
  token: string;
  isActive: boolean;
  hasPassword: boolean;
  shareConfig: ShareConfig;
  viewCount: number;
  lastAccessedAt: Date | null;
}

interface Props {
  accountId: string;
  existing: ExistingLink | null;
}

function formatRelative(d: Date | null): string {
  if (!d) return "sin visitas";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} días`;
}

export function AccountShareSection({ accountId, existing }: Props) {
  // Collapsed by default — even when a link already exists. Makes the
  // account detail page calmer and matches the user's mental model of
  // "this is generated, set & forget unless I want to tweak something".
  const [isOpen, setIsOpen] = useState(false);
  const [link, setLink] = useState<ExistingLink | null>(existing);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const publicUrl = link
    ? `${
        typeof window !== "undefined"
          ? window.location.origin
          : "https://nao.fyi"
      }/c/${link.token}`
    : "";

  function withAction<T>(name: string, fn: () => Promise<T>): void {
    setPendingAction(name);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function handleGenerate() {
    withAction("create", async () => {
      const { token } = await createShareLink(accountId);
      setLink({
        id: "",
        token,
        isActive: true,
        hasPassword: false,
        shareConfig: { ...DEFAULT_SHARE_CONFIG },
        viewCount: 0,
        lastAccessedAt: null,
      });
      // Stay collapsed after creation — the user can expand later to
      // customize modules/password.
      setIsOpen(false);
    });
  }

  function handleToggleConfig(key: keyof ShareConfig, value: boolean) {
    if (!link?.id) return;
    const next = { ...link.shareConfig, [key]: value };
    setLink({ ...link, shareConfig: next });
    withAction(`config-${key}`, () =>
      updateShareConfig(link.id, { [key]: value })
    );
  }

  function handleSetPassword() {
    if (!link?.id) return;
    withAction("password", async () => {
      await setSharePassword(link.id, passwordInput || null);
      setLink({ ...link, hasPassword: !!passwordInput });
      setPasswordInput("");
      setShowPasswordInput(false);
    });
  }

  function handleClearPassword() {
    if (!link?.id) return;
    withAction("password", async () => {
      await setSharePassword(link.id, null);
      setLink({ ...link, hasPassword: false });
    });
  }

  function handleRegenerate() {
    if (!link?.id) return;
    if (
      !confirm(
        "¿Regenerar el link? El link actual deja de funcionar inmediatamente."
      )
    )
      return;
    withAction("regenerate", async () => {
      const { token } = await regenerateShareToken(link.id);
      setLink({ ...link, token });
    });
  }

  function handleToggleActive() {
    if (!link?.id) return;
    withAction("active", async () => {
      const next = !link.isActive;
      await toggleShareLinkActive(link.id, next);
      setLink({ ...link, isActive: next });
    });
  }

  function handleDelete() {
    if (!link?.id) return;
    if (!confirm("¿Eliminar el link? No se puede deshacer.")) return;
    withAction("delete", async () => {
      await deleteShareLink(link.id);
      setLink(null);
      setIsOpen(false);
    });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!link) {
    return (
      <GlassCard className="p-6 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1 flex items-center gap-2">
              <Eye size={16} aria-hidden /> Vista pública
            </h2>
            <p className="text-sm text-muted-foreground">
              El cliente accede a un dashboard read-only de su cuenta vía un
              link único.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pendingAction === "create"}
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {pendingAction === "create"
              ? "Generando..."
              : "Generar link público"}
          </button>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold flex items-center gap-2">
            <Eye size={16} aria-hidden /> Vista pública
          </h2>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              link.isActive
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
            }`}
          >
            {link.isActive ? "Activo" : "Pausado"}
          </span>
          {link.hasPassword && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              Con contraseña
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {link.viewCount} visita{link.viewCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent transition-colors"
              aria-label="Copiar link"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copiado" : "Copiar link"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {isOpen ? "Contraer" : "Configurar"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center rounded-md border border-border px-2.5 py-2 text-xs hover:bg-accent transition-colors"
              aria-label="Copiar"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={link.isActive}
              onChange={handleToggleActive}
              disabled={pendingAction === "active"}
            />
            <span>Activo (si está pausado, el link devuelve 404)</span>
          </label>

          <div>
            <p className="text-sm font-medium mb-2">Contraseña</p>
            {link.hasPassword ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Contraseña configurada
                </span>
                <button
                  type="button"
                  onClick={() => setShowPasswordInput((v) => !v)}
                  className="text-xs underline"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={handleClearPassword}
                  disabled={pendingAction === "password"}
                  className="text-xs underline text-destructive"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPasswordInput((v) => !v)}
                className="text-xs underline"
              >
                Setear contraseña
              </button>
            )}
            {showPasswordInput && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Nueva contraseña"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleSetPassword}
                  disabled={
                    pendingAction === "password" || passwordInput.length < 4
                  }
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Módulos visibles</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                Object.keys(SHARE_CONFIG_LABELS) as Array<keyof ShareConfig>
              ).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={link.shareConfig[k]}
                    onChange={(e) => handleToggleConfig(k, e.target.checked)}
                    disabled={pendingAction === `config-${k}`}
                  />
                  <span>{SHARE_CONFIG_LABELS[k]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {link.viewCount} visita{link.viewCount !== 1 ? "s" : ""} · última:{" "}
            {formatRelative(link.lastAccessedAt)}
          </div>

          <div className="pt-4 [border-top:1px_solid_var(--glass-border)] flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={pendingAction === "regenerate"}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <RefreshCw size={12} /> Regenerar token
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pendingAction === "delete"}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2.5 py-1.5 text-xs hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
