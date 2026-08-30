"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ToastItem } from "../lib/types";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastItem["tone"] = "info") => {
      const id = nextId.current++;
      setToasts((items) => [...items, { id, message, tone }]);
      const timer = setTimeout(() => dismissToast(id), 5000);
      timers.current.set(id, timer);
      return id;
    },
    [dismissToast],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  return { toasts, pushToast, dismissToast };
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div aria-label="Notifications" aria-live="polite" className="toast-viewport">
      {toasts.map((toast) => (
        <div
          className={`toast toast--${toast.tone}`}
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <span aria-hidden="true" className="toast-icon">
            {toast.tone === "success" ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            className="toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            type="button"
          >
            <CloseIcon size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
