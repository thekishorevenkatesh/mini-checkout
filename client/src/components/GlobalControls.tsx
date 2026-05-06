import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";

export function GlobalControls() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useI18n();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">

      {/* Theme Toggle */}
      <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
        <button
          onClick={() => setTheme("light")}
          className={`rounded-md px-2 py-1 text-[11px] transition sm:text-xs ${
            theme === "light"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          ☀️
        </button>

        <button
          onClick={() => setTheme("dark")}
          className={`rounded-md px-2 py-1 text-[11px] transition sm:text-xs ${
            theme === "dark"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          🌙
        </button>
      </div>

      {/* Language Toggle */}
      <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
        <button
          onClick={() => setLanguage("en")}
          className={`rounded-md px-2 py-1 text-[11px] transition sm:text-xs ${
            language === "en"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          EN
        </button>

        <button
          onClick={() => setLanguage("kn")}
          className={`rounded-md px-2 py-1 text-[11px] transition sm:text-xs ${
            language === "kn"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          ಕನ್ನಡ
        </button>
      </div>

    </div>
  );
}
