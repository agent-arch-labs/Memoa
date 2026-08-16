import { useState, useEffect, useCallback, useRef } from "react";

// ─── 通知类型 ──────────────────────────────────────────
export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

// ─── 全局通知管理器 ────────────────────────────────────
type NotifyFn = (n: Omit<Notification, "id">) => void;
let globalNotify: NotifyFn | null = null;

export function notify(n: Omit<Notification, "id">) {
  if (globalNotify) {
    globalNotify(n);
  } else {
    console.log("[Notification]", n.type, n.title, n.message || "");
  }
}

// ─── 通知容器组件 ──────────────────────────────────────
export function NotificationContainer() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const addNotification = useCallback((n: Omit<Notification, "id">) => {
    const id = crypto.randomUUID();
    const duration = n.duration ?? (n.type === "error" ? 6000 : 3500);
    setNotifications((prev) => [...prev.slice(-4), { ...n, id, duration }]);

    if (duration > 0) {
      const timer = setTimeout(() => {
        setNotifications((prev) => prev.filter((x) => x.id !== id));
        timersRef.current.delete(id);
      }, duration);
      timersRef.current.set(id, timer);
    }
  }, []);

  useEffect(() => {
    globalNotify = addNotification;
    return () => {
      globalNotify = null;
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, [addNotification]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((x) => x.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  if (notifications.length === 0) return null;

  const iconMap: Record<NotificationType, React.ReactNode> = {
    info: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    success: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    warning: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    error: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  };

  return (
    <div className="fixed bottom-8 right-4 z-[9998] flex flex-col gap-2 max-w-[360px] pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg shadow-black/20 px-4 py-3 flex items-start gap-3 animate-in slide-in-from-right-2 duration-200"
        >
          <span className="shrink-0 mt-0.5">{iconMap[n.type]}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--color-text-primary)]">{n.title}</div>
            {n.message && (
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{n.message}</div>
            )}
            {n.action && (
              <button
                className="text-xs text-[var(--color-accent)] hover:underline mt-1"
                onClick={n.action.onClick}
              >
                {n.action.label}
              </button>
            )}
          </div>
          <button
            className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            onClick={() => dismiss(n.id)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
