import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";

export function GlobalControls() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="z-50 flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
            theme === "light"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          {t("common.light", "Light")}
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
            theme === "dark"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          {t("common.dark", "Dark")}
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setLanguage("en")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
            language === "en"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLanguage("kn")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
            language === "kn"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          ಕನ್ನಡ
        </button>
      </div>
    </div>
  );
}
