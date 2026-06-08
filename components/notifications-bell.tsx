"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, AtSign, UserPlus } from "lucide-react";
import {
  loadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationView,
} from "@/app/actions/notifications";

function formatWhen(d: Date): string {
  const date = new Date(d);
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `hace ${days} d`;
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    loadNotifications()
      .then((res) => {
        setItems(res.items);
        setUnread(res.unreadCount);
      })
      .catch(() => {
        /* best-effort */
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleOpen(): void {
    setOpen((v) => {
      const next = !v;
      if (next) refresh();
      return next;
    });
  }

  function handleClick(n: NotificationView): void {
    if (!n.isRead) {
      setItems((cur) =>
        cur.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
      );
      setUnread((u) => Math.max(0, u - 1));
      markNotificationRead(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.accountId && n.taskId) {
      router.push(`/app/tareas/${n.accountId}?task=${n.taskId}`);
    } else if (n.accountId) {
      router.push(`/app/tareas/${n.accountId}`);
    }
  }

  function handleMarkAll(): void {
    setItems((cur) => cur.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    markAllNotificationsRead().catch(() => {});
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        aria-label="Notificaciones"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/40 hover:text-foreground dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-10 z-20 w-80 overflow-hidden rounded-xl py-1 backdrop-blur-[18px] [background:var(--glass-bg-strong)] [border:1px_solid_var(--glass-border)] [box-shadow:var(--glass-shadow)]"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-medium text-foreground">
                Notificaciones
              </span>
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  Marcar todas como leídas
                </button>
              )}
            </div>
            <div className="my-1 h-px [background:var(--glass-border)]" />

            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground/70">
                  No tenés notificaciones.
                </p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    role="menuitem"
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-white/40 dark:hover:bg-white/5 ${
                      n.isRead ? "" : "bg-primary/5"
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 text-muted-foreground">
                      {n.type === "assignment" ? (
                        <UserPlus size={14} />
                      ) : (
                        <AtSign size={14} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs leading-snug text-foreground">
                        {n.body}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                        {formatWhen(n.createdAt)}
                      </span>
                    </span>
                    {!n.isRead && (
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
