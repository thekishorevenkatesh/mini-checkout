import { useTheme } from "../context/ThemeContext";
import { AppIcon } from "./ui/AppIcon";

export function GlobalControls() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="surface-card flex items-center rounded-2xl p-1">
        <button
          onClick={() => setTheme("light")}
          aria-label="Use light theme"
          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition sm:text-xs ${
            theme === "light"
              ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <AppIcon name="sun" className="text-[13px]" />
          <span className="hidden sm:inline">Light</span>
        </button>
        <button
          onClick={() => setTheme("dark")}
          aria-label="Use dark theme"
          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition sm:text-xs ${
            theme === "dark"
              ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <AppIcon name="moon" className="text-[13px]" />
          <span className="hidden sm:inline">Dark</span>
        </button>
      </div>
    </div>
  );
}
