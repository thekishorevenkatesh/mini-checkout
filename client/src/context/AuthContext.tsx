import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setApiToken } from "../api/client";
import type { Seller } from "../types";

interface LoginInput {
  businessName: string;
  phone: string;
  upiId: string;
}

interface UpdateProfileInput {
  businessName?: string;
  upiId?: string;
  profileImageUrl?: string;
}

interface AuthContextShape {
  seller: Seller | null;
  token: string | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
}

const TOKEN_KEY = "vendor_mvp_token";
const SELLER_KEY = "vendor_mvp_seller";
const AuthContext = createContext<AuthContextShape | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(TOKEN_KEY)
  );
  const [seller, setSeller] = useState<Seller | null>(() => {
    const value = localStorage.getItem(SELLER_KEY);
    return value ? (JSON.parse(value) as Seller) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setApiToken(token);
  }, [token]);

  useEffect(() => {
    async function bootAuth() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get<{ seller: Seller }>("/auth/me");
        setSeller(response.data.seller);
        localStorage.setItem(SELLER_KEY, JSON.stringify(response.data.seller));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SELLER_KEY);
        setToken(null);
        setSeller(null);
      } finally {
        setLoading(false);
      }
    }

    void bootAuth();
  }, [token]);

  async function login(input: LoginInput) {
    const response = await api.post<{ token: string; seller: Seller }>(
      "/auth/login",
      input
    );

    setToken(response.data.token);
    setSeller(response.data.seller);
    setApiToken(response.data.token);
    localStorage.setItem(TOKEN_KEY, response.data.token);
    localStorage.setItem(SELLER_KEY, JSON.stringify(response.data.seller));
  }

  async function refreshProfile() {
    const response = await api.get<{ seller: Seller }>("/auth/me");
    setSeller(response.data.seller);
    localStorage.setItem(SELLER_KEY, JSON.stringify(response.data.seller));
  }

  async function updateProfile(input: UpdateProfileInput) {
    const response = await api.put<{ seller: Seller }>("/auth/me", input);
    setSeller(response.data.seller);
    localStorage.setItem(SELLER_KEY, JSON.stringify(response.data.seller));
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SELLER_KEY);
    setApiToken(null);
    setToken(null);
    setSeller(null);
  }

  const value = useMemo(
    () => ({
      seller,
      token,
      loading,
      login,
      logout,
      refreshProfile,
      updateProfile,
    }),
    [loading, seller, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
