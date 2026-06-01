import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GlobalControls } from "./components/GlobalControls";
import { ZensosLogo } from "./components/ZensosLogo";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicStoreHeaderContext, type PublicStoreHeader } from "./context/PublicStoreHeaderContext";
import { ToastProvider } from "./context/ToastContext";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicStorePage } from "./pages/PublicStorePage";
import { ThankYouPage } from "./pages/ThankYouPage";

function AppShell() {
  const location = useLocation();
  const [publicStoreHeader, setPublicStoreHeader] = useState<PublicStoreHeader | null>(null);
  const isPublicStore = location.pathname.startsWith("/store/");

  return (
    <PublicStoreHeaderContext.Provider value={{ publicStoreHeader, setPublicStoreHeader }}>
      <div className="min-h-screen">
        <header className="app-shell-header sticky top-0 z-40 px-3 py-3 sm:px-4">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
            {isPublicStore && publicStoreHeader ? (
              <div className="flex min-w-0 items-center gap-2.5">
                {publicStoreHeader.logo ? (
                  <img
                    src={publicStoreHeader.logo}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-xl border border-slate-200/80 bg-white object-contain p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:h-11 sm:w-11"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold uppercase text-white dark:bg-slate-100 dark:text-slate-950 sm:h-11 sm:w-11">
                    {publicStoreHeader.name.trim().charAt(0) || "S"}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Online Store</p>
                  <p className="truncate font-heading text-base font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-lg">
                    {publicStoreHeader.name}
                  </p>
                </div>
              </div>
            ) : (
              <ZensosLogo size="lg" alt="Zensos" />
            )}
            <GlobalControls />
          </div>
        </header>
        <Routes>
          <Route path="/store/:sellerSlug" element={<PublicStorePage />} />
          <Route path="/thank-you" element={<ThankYouPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </PublicStoreHeaderContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </BrowserRouter>
  );
}
