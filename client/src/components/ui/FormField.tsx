import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type FieldState = "default" | "error" | "success";

const stateClass: Record<FieldState, string> = {
  default: "border-slate-200 focus:border-teal-400 focus:ring-teal-100 dark:border-slate-700",
  error: "border-rose-300 focus:border-rose-400 focus:ring-rose-100 dark:border-rose-700",
  success: "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100 dark:border-emerald-700",
};

type BaseProps = {
  label: string;
  hint?: string;
  error?: string;
  success?: string;
  required?: boolean;
};

type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement>;
type TextAreaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true };

export function InputField({ label, hint, error, success, required, className = "", ...props }: InputProps) {
  const fieldState: FieldState = error ? "error" : success ? "success" : "default";
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}{required ? " *" : ""}
      </span>
      <input
        {...props}
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-900 dark:text-slate-100 ${stateClass[fieldState]} ${className}`}
      />
      {error ? <span className="text-xs text-rose-600 dark:text-rose-300">{error}</span> : null}
      {!error && success ? <span className="text-xs text-emerald-600 dark:text-emerald-300">{success}</span> : null}
      {!error && !success && hint ? <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function TextAreaField({ label, hint, error, success, required, className = "", ...props }: TextAreaProps) {
  const fieldState: FieldState = error ? "error" : success ? "success" : "default";
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}{required ? " *" : ""}
      </span>
      <textarea
        {...props}
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-900 dark:text-slate-100 ${stateClass[fieldState]} ${className}`}
      />
      {error ? <span className="text-xs text-rose-600 dark:text-rose-300">{error}</span> : null}
      {!error && success ? <span className="text-xs text-emerald-600 dark:text-emerald-300">{success}</span> : null}
      {!error && !success && hint ? <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function FieldGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      {title ? <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">{title}</p> : null}
      {children}
    </div>
  );
}
