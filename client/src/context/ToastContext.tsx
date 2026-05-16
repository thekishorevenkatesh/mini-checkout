import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "../components/ui/AppIcon";

type ToastTone = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const TOAST_TIMEOUT_MS = 3200;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) return;

    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message: cleanMessage, tone }]);
    window.setTimeout(() => dismissToast(id), TOAST_TIMEOUT_MS);
  }, [dismissToast]);

  const value = useMemo<ToastContextValue>(() => ({
    showToast,
    showSuccess: (message: string) => showToast(message, "success"),
    showError: (message: string) => showToast(message, "error"),
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:w-full sm:max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${
              toast.tone === "success"
                ? "border-emerald-200 bg-white/95 text-emerald-800"
                : "border-rose-200 bg-white/95 text-rose-800"
            }`}
          >
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              toast.tone === "success"
                ? "bg-emerald-100 text-emerald-600"
                : "bg-rose-100 text-rose-600"
            }`}>
              <AppIcon name={toast.tone === "success" ? "check" : "close"} className="text-[12px]" />
            </span>
            <p className="flex-1 text-sm font-semibold leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss notification"
            >
              <AppIcon name="close" className="text-[10px]" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
