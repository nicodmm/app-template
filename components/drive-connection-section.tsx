"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, RefreshCw, Unplug, Loader2 } from "lucide-react";
import {
  listDriveFoldersForConnection,
  setDriveFolder,
  setDriveLinkOnlySync,
  disconnectDrive,
  syncDriveNow,
} from "@/app/actions/drive";
import type { DriveConnection } from "@/lib/queries/drive";

interface Props {
  connection: DriveConnection;
  canManage: boolean;
}

interface FolderOption {
  id: string;
  name: string;
}

export function DriveConnectionSection({ connection, canManage }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [folders, setFolders] = useState<FolderOption[] | null>(null);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function fetchFolders(query?: string): Promise<void> {
    setFoldersError(null);
    setFolders(null);
    const result = await listDriveFoldersForConnection(connection.id, query);
    if (result.error) {
      setFoldersError(result.error);
    } else {
      setFolders(result.folders ?? []);
    }
  }

  async function handlePickFolder(folder: FolderOption): Promise<void> {
    startTransition(async () => {
      const result = await setDriveFolder(connection.id, folder.id, folder.name);
      if (result.error) {
        setFoldersError(result.error);
      } else {
        setPickerOpen(false);
        router.refresh();
      }
    });
  }

  async function handleDisconnect(): Promise<void> {
    if (!confirm("¿Desconectar Google Drive? Las imports se detienen.")) return;
    startTransition(async () => {
      await disconnectDrive(connection.id);
      router.refresh();
    });
  }

  function handleSyncNow(): void {
    if (pending) return;
    setSyncMessage(null);
    startTransition(async () => {
      const result = await syncDriveNow(connection.id);
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
      <div className="space-y-4">
        <div className="text-sm">
          <p className="flex items-center gap-2">
            <span>
              Conectado como{" "}
              <span className="font-medium">
                {connection.googleAccountEmail ?? "(email desconocido)"}
              </span>
            </span>
            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase bg-muted text-muted-foreground">
              {connection.scope === "workspace" ? "Compartido" : "Personal"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {connection.folderId ? (
              <>
                Carpeta:{" "}
                <span className="font-medium text-foreground">
                  {connection.folderName}
                </span>
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
            <p className="text-xs text-destructive mt-1">
              Error último: {connection.lastError}
            </p>
          )}
        </div>

        {canManage && (
          <>
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
                    await setDriveLinkOnlySync(connection.id, next);
                    router.refresh();
                  });
                }}
                disabled={pending}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">
                  Solo guardar links (modo liviano)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cuando está prendido, los archivos sincronizados se guardan como
                  referencia con el link a Drive.{" "}
                  <strong>No se descarga el contenido</strong> y no se extraen
                  tareas, contactos ni resumen automático. Bajás el peso de la app
                  a costa de las features de IA sobre esos archivos.
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
          </>
        )}
      </div>
    </section>
  );
}
