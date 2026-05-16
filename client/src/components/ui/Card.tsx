import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`surface-card rounded-[28px] p-5 ${className}`}>
      {children}
    </section>
  );
}
