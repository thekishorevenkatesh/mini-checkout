import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GlobalControls } from "./components/GlobalControls";
import { ZensosLogo } from "./components/ZensosLogo";
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
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
              <ZensosLogo size="lg" alt="Zensos" />
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
