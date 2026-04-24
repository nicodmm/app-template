"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2, Send, Loader2 } from "lucide-react";
import {
  renameWorkspace,
  createWorkspaceInvite,
  revokeWorkspaceInvite,
  removeWorkspaceMember,
  changeWorkspaceMemberRole,
} from "@/app/actions/workspace";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";
import type { PendingInvite } from "@/lib/queries/workspace-invites";

interface WorkspaceSettingsClientProps {
  workspaceId: string;
  workspaceName: string;
  currentUserId: string;
  currentUserRole: string;
  members: WorkspaceMemberWithUser[];
  pendingInvites: PendingInvite[];
  appUrl: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function WorkspaceSettingsClient(props: WorkspaceSettingsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canManage = props.currentUserRole === "owner" || props.currentUserRole === "admin";

  const [name, setName] = useState(props.workspaceName);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteMsg, setInviteMsg] = useState<
    | { kind: "success"; link: string }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function handleRename() {
    setNameMsg(null);
    const result = await renameWorkspace(name);
    if (result.error) setNameMsg(result.error);
    else {
      setNameMsg("Guardado");
      setTimeout(() => setNameMsg(null), 1200);
    }
  }

  async function handleInvite() {
    setInviteMsg(null);
    const result = await createWorkspaceInvite(inviteEmail, inviteRole);
    if (result.error) {
      setInviteMsg({ kind: "error", message: result.error });
      return;
    }
    if (result.token) {
      const link = `${props.appUrl}/invites/${result.token}`;
      setInviteMsg({ kind: "success", link });
      setInviteEmail("");
      router.refresh();
    }
  }

  async function copyLink(text: string, token: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <div className="space-y-8">
      {/* Workspace name */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-3">Nombre del workspace</h2>
        {canManage ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              onClick={handleRename}
              disabled={!name.trim() || name === props.workspaceName}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Guardar
            </button>
          </div>
        ) : (
          <p className="text-sm">{props.workspaceName}</p>
        )}
        {nameMsg && (
          <p className="text-xs text-muted-foreground mt-2">{nameMsg}</p>
        )}
      </section>

      {/* Members */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Miembros ({props.members.length})</h2>
        <div className="divide-y divide-border">
          {props.members.map((m) => {
            const isSelf = m.userId === props.currentUserId;
            const isOwner = m.role === "owner";
            return (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.displayName}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage && !isOwner && !isSelf ? (
                    <select
                      value={m.role}
                      disabled={pending}
                      onChange={(e) =>
                        startTransition(async () => {
                          await changeWorkspaceMemberRole(m.userId, e.target.value);
                          router.refresh();
                        })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium">
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  )}
                  {canManage && !isOwner && !isSelf && (
                    <button
                      onClick={() => {
                        if (!confirm(`¿Sacar a ${m.displayName} del workspace?`)) return;
                        startTransition(async () => {
                          await removeWorkspaceMember(m.userId);
                          router.refresh();
                        });
                      }}
                      disabled={pending}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Eliminar miembro"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Invites */}
      {canManage && (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Invitar a alguien</h2>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send size={13} />
              Crear invitación
            </button>
          </div>

          {inviteMsg?.kind === "error" && (
            <p className="text-sm text-destructive">{inviteMsg.message}</p>
          )}
          {inviteMsg?.kind === "success" && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2">
                Invitación creada. Copiá el link y mandáselo a la persona:
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteMsg.link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                />
                <button
                  onClick={() => copyLink(inviteMsg.link, "new")}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent transition-colors"
                >
                  <Copy size={12} />
                  {copiedToken === "new" ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          {props.pendingInvites.length > 0 && (
            <>
              <h3 className="text-sm font-medium mt-6 mb-2">Invitaciones pendientes</h3>
              <div className="divide-y divide-border">
                {props.pendingInvites.map((inv) => {
                  const link = `${props.appUrl}/invites/${inv.token}`;
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">
                          {inv.email} · {ROLE_LABEL[inv.role] ?? inv.role}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Expira el{" "}
                          {new Date(inv.expiresAt).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                          })}
                          {inv.invitedByName && ` · Invitado por ${inv.invitedByName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => copyLink(link, inv.token)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent transition-colors"
                        >
                          <Copy size={12} />
                          {copiedToken === inv.token ? "Copiado" : "Link"}
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`¿Revocar la invitación para ${inv.email}?`)) return;
                            startTransition(async () => {
                              await revokeWorkspaceInvite(inv.id);
                              router.refresh();
                            });
                          }}
                          disabled={pending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Revocar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {pending && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Actualizando...
            </div>
          )}
        </section>
      )}
    </div>
  );
}
