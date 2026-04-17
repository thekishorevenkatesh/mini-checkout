import { useEffect, useRef, useState } from "react";
import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";

export function GlobalControls() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t, supportedLanguages } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      {/* Desktop: inline utility controls */}
      <div className="hidden items-center gap-2 sm:flex">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {theme === "light" ? "☀️" : "🌙"} {theme === "light" ? t("common.light", "Light") : t("common.dark", "Dark")}
        </button>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as "en" | "kn")}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          aria-label={t("common.language", "Language")}
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Mobile: compact menu trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 sm:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        aria-expanded={open}
        aria-label={t("controls.customize", "Customize")}
      >
        ⚙️ {t("controls.customize", "Customize")}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg sm:hidden dark:border-slate-700 dark:bg-slate-900">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
            {t("common.theme", "Theme")}
          </p>
          <button
            type="button"
            onClick={() => {
              toggleTheme();
              setOpen(false);
            }}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {theme === "light" ? "☀️" : "🌙"} {theme === "light" ? t("common.light", "Light") : t("common.dark", "Dark")}
          </button>

          <p className="mt-3 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
            {t("common.language", "Language")}
          </p>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as "en" | "kn");
              setOpen(false);
            }}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            aria-label={t("common.language", "Language")}
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
