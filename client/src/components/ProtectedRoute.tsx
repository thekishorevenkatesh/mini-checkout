import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { seller, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4">
        <p className="rounded-full border border-white/70 bg-white/80 px-5 py-2 text-sm font-semibold text-slate-600 shadow-card">
          Loading vendor workspace...
        </p>
      </div>
    );
  }

  if (!seller) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
