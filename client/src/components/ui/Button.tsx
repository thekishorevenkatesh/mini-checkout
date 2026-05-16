import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AppIcon } from "./AppIcon";

type Variant = "primary" | "secondary" | "success" | "danger";

const variantClasses: Record<Variant, string> = {
  primary:
    "border border-slate-900 bg-slate-900 text-white shadow-sm hover:-translate-y-0.5 hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:disabled:bg-slate-700",
  secondary:
    "border border-slate-200 bg-white/90 text-slate-700 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-900",
  success:
    "border border-teal-600 bg-teal-600 text-white shadow-sm hover:-translate-y-0.5 hover:bg-teal-500 dark:border-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400",
  danger:
    "border border-rose-600 bg-rose-600 text-white shadow-sm hover:-translate-y-0.5 hover:bg-rose-500 dark:border-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  fullWidth = false,
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold tracking-[0.01em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55 ${fullWidth ? "w-full" : ""} ${variantClasses[variant]} ${className}`}
    >
      {loading ? (
        <span className="inline-flex h-4 w-4 animate-spin items-center justify-center">
          <AppIcon name="refresh" className="text-[14px]" />
        </span>
      ) : null}
      {children}
    </button>
  );
}
