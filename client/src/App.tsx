import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GlobalControls } from "./components/GlobalControls";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicStorePage } from "./pages/PublicStorePage";
import { ThankYouPage } from "./pages/ThankYouPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="border-b border-slate-200/80 bg-white/85 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-950/80 sm:px-4">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              MyDukan
            </p>
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
    </BrowserRouter>
  );
}
