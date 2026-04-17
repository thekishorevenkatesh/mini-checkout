import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-slate-700 dark:bg-slate-900/90 ${className}`}>
      {children}
    </section>
  );
}
