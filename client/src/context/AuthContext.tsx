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

interface SendOtpInput {
  phone?: string;
  email?: string;
}

interface VerifyOtpInput {
  phone?: string;
  email?: string;
  otp: string;
}

interface RegisterInput {
  businessName: string;
  businessEmail?: string;
  businessAddress?: string;
  businessGST?: string;
  upiId?: string;
  businessLogo?: string;
  whatsappNumber?: string;
  callNumber?: string;
  privacyPolicy?: string;
  returnRefundPolicy?: string;
  termsAndConditions?: string;
}

interface UpdateProfileInput {
  businessName?: string;
  businessEmail?: string;
  businessAddress?: string;
  businessGST?: string;
  upiId?: string;
  profileImageUrl?: string;
  businessLogo?: string;
  favicon?: string;
  whatsappNumber?: string;
  callNumber?: string;
  privacyPolicy?: string;
  returnRefundPolicy?: string;
  termsAndConditions?: string;
}

interface AuthContextShape {
  seller: Seller | null;
  token: string | null;
  loading: boolean;
  sendOtp: (input: SendOtpInput) => Promise<{ isNew: boolean; hasEmail: boolean; otp?: string }>;
  verifyOtp: (input: VerifyOtpInput) => Promise<{ isProfileComplete: boolean }>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
}

const TOKEN_KEY = "mydukan_token";
const SELLER_KEY = "mydukan_seller";
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

  async function sendOtp(input: SendOtpInput) {
    const response = await api.post<{
      isNew: boolean;
      hasEmail: boolean;
      otp?: string;
    }>("/auth/send-otp", input);
    return response.data;
  }

  async function verifyOtp(input: VerifyOtpInput) {
    const response = await api.post<{
      token: string;
      seller: Seller;
      isProfileComplete: boolean;
    }>("/auth/verify-otp", input);

    const { token: newToken, seller: newSeller, isProfileComplete } = response.data;
    setToken(newToken);
    setSeller(newSeller);
    setApiToken(newToken);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(SELLER_KEY, JSON.stringify(newSeller));
    return { isProfileComplete };
  }

  async function register(input: RegisterInput) {
    const response = await api.post<{ seller: Seller }>("/auth/register", input);
    setSeller(response.data.seller);
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
      sendOtp,
      verifyOtp,
      register,
      logout,
      refreshProfile,
      updateProfile,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
