import { AppIcon } from "./ui/AppIcon";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { seller, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4">
        <div className="surface-card-strong inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <AppIcon name="refresh" className="text-[14px]" />
          </span>
          Loading vendor workspace...
        </div>
      </div>
    );
  }

  if (!seller) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
