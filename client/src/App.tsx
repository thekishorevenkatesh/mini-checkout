import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GlobalControls } from "./components/GlobalControls";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ToastProvider } from "./context/ToastContext";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicStorePage } from "./pages/PublicStorePage";
import { ThankYouPage } from "./pages/ThankYouPage";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="min-h-screen">
          <header className="app-shell-header sticky top-0 z-40 px-3 py-3 sm:px-4">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
                  <span className="text-sm font-black tracking-tight">M</span>
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Commerce Suite
                  </p>
                  <p className="text-sm font-semibold tracking-[0.01em] text-slate-800 dark:text-slate-100">
                    MyDukan
                  </p>
                </div>
              </div>
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
      </ToastProvider>
    </BrowserRouter>
  );
}
