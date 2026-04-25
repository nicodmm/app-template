"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, RefreshCw, Unplug, Loader2 } from "lucide-react";
import {
  listDriveFoldersForWorkspace,
  setDriveFolder,
  setDriveLinkOnlySync,
  disconnectDrive,
  syncDriveNow,
} from "@/app/actions/drive";
import type { DriveConnection } from "@/lib/queries/drive";

interface WorkspaceDriveSectionProps {
  connection: DriveConnection | null;
  isConfigured: boolean;
  canManage: boolean;
  driveSuccess?: string;
  driveError?: string;
}

interface FolderOption {
  id: string;
  name: string;
}

export function WorkspaceDriveSection({
  connection,
  isConfigured,
  canManage,
  driveSuccess,
  driveError,
}: WorkspaceDriveSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [folders, setFolders] = useState<FolderOption[] | null>(null);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (!canManage) return null;

  if (!isConfigured) {
    return (
      <section className="rounded-xl p-6 backdrop-blur-[20px] [background:var(--glass-bg)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]">
        <h2 className="font-semibold mb-2">Google Drive</h2>
        <p className="text-sm text-muted-foreground">
          La integración no está configurada todavía. Necesitamos que el dueño del proyecto cree
          credenciales OAuth en Google Cloud Console y las agregue como variables de entorno.
          Mirá el spec <code className="text-xs">docs/superpowers/specs/2026-04-24-drive-auto-import-design.md</code> para los pasos.
        </p>
      </section>
    );
  }

  async function fetchFolders(query?: string) {
    setFoldersError(null);
    setFolders(null);
    const result = await listDriveFoldersForWorkspace(query);
    if (result.error) {
      setFoldersError(result.error);
    } else {
      setFolders(result.folders ?? []);
    }
  }

  async function handlePickFolder(folder: FolderOption) {
    startTransition(async () => {
      const result = await setDriveFolder(folder.id, folder.name);
      if (result.error) {
        setFoldersError(result.error);
      } else {
        setPickerOpen(false);
        router.refresh();
      }
    });
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar Google Drive? Las imports se detienen.")) return;
    startTransition(async () => {
      await disconnectDrive();
      router.refresh();
    });
  }

  function handleSyncNow() {
    if (pending) return;
    setSyncMessage(null);
    startTransition(async () => {
      const result = await syncDriveNow();
      if (result.error) {
        setSyncMessage(`Error: ${result.error}`);
      } else {
        setSyncMessage(
          "Sync disparado — los archivos van a aparecer en unos segundos."
        );
        setTimeout(() => router.refresh(), 5000);
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-semibold mb-3">Google Drive</h2>

      {driveSuccess && (
        <div className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          Drive conectado correctamente.
        </div>
      )}
      {driveError && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Error al conectar Drive: {decodeURIComponent(driveError)}
        </div>
      )}

      {!connection ? (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Conectá tu Drive y elegí una carpeta. Cada 30 minutos sincronizamos archivos nuevos:
            transcripciones se procesan; planillas, presentaciones y otros pasan a "Archivos de
            contexto" del cliente cuyo nombre aparezca en el filename.
          </p>
          <a
            href="/api/auth/google/login"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Conectar Google Drive
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm">
            <p>
              Conectado como{" "}
              <span className="font-medium">{connection.googleAccountEmail ?? "(email desconocido)"}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {connection.folderId ? (
                <>
                  Carpeta: <span className="font-medium text-foreground">{connection.folderName}</span>
                </>
              ) : (
                <>Sin carpeta configurada todavía.</>
              )}
              {connection.lastSyncAt && (
                <>
                  {" · "}Última sync:{" "}
                  {new Date(connection.lastSyncAt).toLocaleString("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </>
              )}
            </p>
            {connection.lastError && (
              <p className="text-xs text-destructive mt-1">Error último: {connection.lastError}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setPickerOpen((v) => !v);
                if (!pickerOpen) fetchFolders();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              <FolderInput size={14} />
              {connection.folderId ? "Cambiar carpeta" : "Elegir carpeta"}
            </button>
            {connection.folderId && (
              <button
                onClick={handleSyncNow}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {pending ? "Sincronizando..." : "Sincronizar ahora"}
              </button>
            )}
            <button
              onClick={handleDisconnect}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Unplug size={14} />
              Desconectar
            </button>
          </div>

          {syncMessage && (
            <p className="text-xs text-muted-foreground">{syncMessage}</p>
          )}

          <label className="flex items-start gap-2 rounded-md border border-border bg-background/50 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors">
            <input
              type="checkbox"
              defaultChecked={connection.linkOnlySync}
              onChange={(e) => {
                const next = e.currentTarget.checked;
                startTransition(async () => {
                  await setDriveLinkOnlySync(next);
                  router.refresh();
                });
              }}
              disabled={pending}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-none">Solo guardar links (modo liviano)</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cuando está prendido, los archivos sincronizados se guardan como referencia
                con el link a Drive. <strong>No se descarga el contenido</strong> y no se extraen
                tareas, contactos ni resumen automático. Bajás el peso de la app a costa de las
                features de IA sobre esos archivos.
              </p>
            </div>
          </label>

          {pickerOpen && (
            <div className="rounded-md border border-border bg-background p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Buscar carpeta por nombre..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  onClick={() => fetchFolders(search.trim() || undefined)}
                  className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent transition-colors"
                >
                  Buscar
                </button>
              </div>
              {foldersError && (
                <p className="text-xs text-destructive">{foldersError}</p>
              )}
              {folders === null && !foldersError && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Cargando carpetas...
                </p>
              )}
              {folders && folders.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin resultados.</p>
              )}
              {folders && folders.length > 0 && (
                <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                  {folders.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 py-1.5"
                    >
                      <span className="text-sm truncate">{f.name}</span>
                      <button
                        onClick={() => handlePickFolder(f)}
                        disabled={pending}
                        className="text-xs text-primary hover:underline disabled:opacity-50"
                      >
                        Elegir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
