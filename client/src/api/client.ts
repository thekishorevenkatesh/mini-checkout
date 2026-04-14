import axios from "axios";

const explicitBaseUrl = import.meta.env.VITE_API_BASE_URL;
const hostname =
  typeof window !== "undefined" ? window.location.hostname : "localhost";
const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
const fallbackBaseUrl = isLocalhost ? "http://localhost:5000/api" : "/api";

const baseURL = explicitBaseUrl || fallbackBaseUrl;

if (!explicitBaseUrl && !isLocalhost) {
  console.warn(
    "VITE_API_BASE_URL is not set for this deployment. Configure it in Vercel frontend env vars."
  );
}

export const api = axios.create({
  baseURL,
});

export function setApiToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete api.defaults.headers.common.Authorization;
}
