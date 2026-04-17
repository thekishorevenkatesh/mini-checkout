import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const toneClasses: Record<Tone, string> = {
  error:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200",
  info:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200",
};

export function Alert({ tone, children, className = "" }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <p className={`rounded-xl border px-3 py-2 text-sm ${toneClasses[tone]} ${className}`}>
      {children}
    </p>
  );
}
