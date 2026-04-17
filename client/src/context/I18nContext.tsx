import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Language = "en" | "kn";
type Dictionary = Record<string, string>;

const translations: Record<Language, Dictionary> = {
  en: {
    "common.light": "Light",
    "common.dark": "Dark",
    "common.language": "Language",
    "common.theme": "Theme",
    "lang.english": "English",
    "lang.kannada": "Kannada",
    "controls.customize": "Customize",
    "nav.dashboard": "Dashboard",
    "nav.store": "Store Options",
    "nav.products": "Products",
    "nav.orders": "Orders",
    "nav.reports": "Reports",
    "nav.profile": "Profile",
    "nav.policies": "Policies",
    "auth.login": "Login",
    "auth.register": "Register",
    "store.checkout": "Checkout",
    "admin.title": "Seller Approvals",
  },
  kn: {
    "common.light": "ಬೆಳಕು",
    "common.dark": "ಕತ್ತಲೆ",
    "common.language": "ಭಾಷೆ",
    "common.theme": "ಥೀಮ್",
    "lang.english": "ಇಂಗ್ಲಿಷ್",
    "lang.kannada": "ಕನ್ನಡ",
    "controls.customize": "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
    "nav.dashboard": "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    "nav.store": "ಅಂಗಡಿ ಆಯ್ಕೆಗಳು",
    "nav.products": "ಉತ್ಪನ್ನಗಳು",
    "nav.orders": "ಆರ್ಡರ್‌ಗಳು",
    "nav.reports": "ವರದಿಗಳು",
    "nav.profile": "ಪ್ರೊಫೈಲ್",
    "nav.policies": "ನೀತಿಗಳು",
    "auth.login": "ಲಾಗಿನ್",
    "auth.register": "ನೋಂದಣಿ",
    "store.checkout": "ಚೆಕ್‌ಔಟ್",
    "admin.title": "ಮಾರಾಟಗಾರ ಅನುಮೋದನೆಗಳು",
  },
};

type I18nContextShape = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, fallback?: string) => string;
  supportedLanguages: { code: Language; label: string }[];
};

const STORAGE_KEY = "mydukan_language";
const I18nContext = createContext<I18nContextShape | undefined>(undefined);

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "kn" || stored === "en") return stored;
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo<I18nContextShape>(
    () => ({
      language,
      setLanguage,
      t: (key, fallback) => translations[language][key] || fallback || key,
      supportedLanguages: [
        { code: "en", label: translations[language]["lang.english"] || "English" },
        { code: "kn", label: translations[language]["lang.kannada"] || "Kannada" },
      ],
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
