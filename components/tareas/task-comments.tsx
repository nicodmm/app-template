"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Trash2, Paperclip, LinkIcon, Plus, X } from "lucide-react";
import {
  loadTaskThread,
  addComment,
  deleteComment,
  addAttachment,
  deleteAttachment,
} from "@/app/actions/tareas";
import type {
  TaskCommentView,
  TaskThread,
} from "@/lib/queries/tareas";
import type { TaskAttachment } from "@/lib/drizzle/schema";
import type { WorkspaceMemberWithUser } from "@/lib/queries/workspace";

interface TaskCommentsProps {
  taskId: string;
  accountId: string;
  members: WorkspaceMemberWithUser[];
  currentUserId: string | null;
}

function formatWhen(d: Date): string {
  const date = new Date(d);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function TaskComments({
  taskId,
  accountId,
  members,
  currentUserId,
}: TaskCommentsProps) {
  const [thread, setThread] = useState<TaskThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showAttachForm, setShowAttachForm] = useState(false);
  const [attLabel, setAttLabel] = useState("");
  const [attUrl, setAttUrl] = useState("");

  // Carga lazy del hilo al montar (cuando se abre el drawer de la tarea).
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadTaskThread(taskId, accountId)
      .then((res) => {
        if (!active) return;
        if (res.error || !res.thread) {
          setError(res.error ?? "No se pudo cargar el hilo.");
          return;
        }
        setThread(res.thread);
      })
      .catch(() => active && setError("No se pudo cargar el hilo."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [taskId, accountId]);

  function nameFor(userId: string | null): string {
    if (userId && userId === currentUserId) return "Vos";
    const m = members.find((mm) => mm.userId === userId);
    return m?.displayName ?? "Usuario";
  }

  function handleBodyChange(value: string, selectionStart: number): void {
    setBody(value);
    setCaret(selectionStart);
    const before = value.slice(0, selectionStart);
    const match = before.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function pickMention(member: WorkspaceMemberWithUser): void {
    const q = mentionQuery ?? "";
    const before = body.slice(0, caret - q.length - 1); // quita "@" + token
    const after = body.slice(caret);
    const next = `${before}@${member.displayName} ${after}`;
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function resolveMentions(text: string): string[] {
    return members
      .filter((m) => text.includes(`@${m.displayName}`))
      .map((m) => m.userId);
  }

  function handleSend(e: React.FormEvent): void {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const mentioned = resolveMentions(text);
    addComment(taskId, accountId, text, mentioned)
      .then((res) => {
        if (res.error || !res.comment) {
          setError(res.error ?? "No se pudo comentar.");
          return;
        }
        const created = res.comment;
        setThread((cur) =>
          cur
            ? { ...cur, comments: [...cur.comments, created] }
            : { comments: [created], attachments: [] }
        );
        setBody("");
        setMentionQuery(null);
      })
      .catch(() => setError("No se pudo comentar."))
      .finally(() => setSending(false));
  }

  function handleDeleteComment(comment: TaskCommentView): void {
    if (!window.confirm("¿Eliminar este comentario?")) return;
    const prev = thread;
    setThread((cur) =>
      cur
        ? { ...cur, comments: cur.comments.filter((c) => c.id !== comment.id) }
        : cur
    );
    deleteComment(comment.id, accountId)
      .then((res) => {
        if (res.error) {
          setThread(prev);
          setError(res.error);
        }
      })
      .catch(() => {
        setThread(prev);
        setError("No se pudo eliminar el comentario.");
      });
  }

  function handleAddAttachment(e: React.FormEvent): void {
    e.preventDefault();
    if (!attUrl.trim()) return;
    addAttachment(taskId, accountId, attLabel, attUrl)
      .then((res) => {
        if (res.error || !res.attachment) {
          setError(res.error ?? "No se pudo agregar el adjunto.");
          return;
        }
        const created = res.attachment;
        setThread((cur) =>
          cur
            ? { ...cur, attachments: [created, ...cur.attachments] }
            : { comments: [], attachments: [created] }
        );
        setAttLabel("");
        setAttUrl("");
        setShowAttachForm(false);
      })
      .catch(() => setError("No se pudo agregar el adjunto."));
  }

  function handleDeleteAttachment(att: TaskAttachment): void {
    const prev = thread;
    setThread((cur) =>
      cur
        ? { ...cur, attachments: cur.attachments.filter((a) => a.id !== att.id) }
        : cur
    );
    deleteAttachment(att.id, accountId)
      .then((res) => {
        if (res.error) {
          setThread(prev);
          setError(res.error);
        }
      })
      .catch(() => {
        setThread(prev);
        setError("No se pudo eliminar el adjunto.");
      });
  }

  const filteredMembers =
    mentionQuery !== null
      ? members
          .filter((m) =>
            m.displayName.toLowerCase().includes(mentionQuery.toLowerCase())
          )
          .slice(0, 6)
      : [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {/* Adjuntos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Paperclip size={12} /> Adjuntos
            {thread && thread.attachments.length > 0 && (
              <span className="text-muted-foreground/70">
                · {thread.attachments.length}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowAttachForm((v) => !v)}
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus size={11} /> Link
          </button>
        </div>

        {thread && thread.attachments.length > 0 && (
          <ul className="space-y-1">
            {thread.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
              >
                <LinkIcon size={12} className="shrink-0 text-muted-foreground" />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 truncate text-xs text-primary hover:underline"
                >
                  {a.label}
                </a>
                <button
                  type="button"
                  onClick={() => handleDeleteAttachment(a)}
                  aria-label="Quitar adjunto"
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {showAttachForm && (
          <form
            onSubmit={handleAddAttachment}
            className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2"
          >
            <input
              type="text"
              value={attLabel}
              onChange={(e) => setAttLabel(e.target.value)}
              placeholder="Nombre (opcional)"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              type="url"
              value={attUrl}
              onChange={(e) => setAttUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={!attUrl.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Agregar adjunto
            </button>
          </form>
        )}
      </div>

      {/* Comentarios */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">
          Comentarios
          {thread && thread.comments.length > 0 && (
            <span className="text-muted-foreground/70">
              {" "}
              · {thread.comments.length}
            </span>
          )}
        </span>

        {loading && (
          <p className="text-[11px] text-muted-foreground/70">Cargando…</p>
        )}

        {thread && thread.comments.length > 0 && (
          <ul className="space-y-2">
            {thread.comments.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-background px-2.5 py-2"
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-foreground">
                    {nameFor(c.authorId)}
                    <span className="ml-1.5 font-normal text-muted-foreground/70">
                      {formatWhen(c.createdAt)}
                    </span>
                  </span>
                  {c.authorId === currentUserId && (
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(c)}
                      aria-label="Eliminar comentario"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Caja de nuevo comentario */}
        <form onSubmit={handleSend} className="relative space-y-1.5">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) =>
              handleBodyChange(e.target.value, e.target.selectionStart)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSend(e);
              }
            }}
            rows={2}
            placeholder="Escribí un comentario… usá @ para mencionar"
            className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {mentionQuery !== null && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-md border border-border bg-card shadow-lg">
              {filteredMembers.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => pickMention(m)}
                  className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                >
                  {m.displayName}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!body.trim() || sending}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send size={12} /> Comentar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
