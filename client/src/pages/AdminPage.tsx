import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../api/client";
import { AppIcon } from "../components/ui/AppIcon";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InputField } from "../components/ui/FormField";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import type { Seller } from "../types";

type ApprovalStatus = "pending" | "approved" | "rejected";
type SortBy = "latest" | "oldest" | "business";

const ADMIN_TOKEN_KEY = "zensos_admin_token";

function statusBadge(status: ApprovalStatus) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
  if (status === "rejected") return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
  return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
}

function displayValue(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || "Not added";
}

function formatPaymentMode(mode?: Seller["paymentMode"]) {
  if (mode === "cod_only") return "COD only";
  if (mode === "both") return "Prepaid + COD";
  if (mode === "prepaid_only") return "Prepaid only";
  return "";
}

function formatDeliveryMode(mode?: Seller["deliveryMode"]) {
  if (mode === "flat_rate") return "Flat delivery charge";
  if (mode === "always_free") return "Always free delivery";
  return "";
}

function DetailCell({ label, value }: { label: string; value?: string | null }) {
  const text = displayValue(value);
  const isMissing = text === "Not added";
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-1 break-words text-sm font-semibold ${
          isMissing ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  eyebrow,
  icon,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-300">
              {eyebrow}
            </p>
          ) : null}
          <h4 className="font-heading text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mt-0.5">
            {icon}
            {title}
          </h4>
        </div>
      </div>
      {children}
    </article>
  );
}

function DocumentPreview({
  label,
  hint,
  url,
}: {
  label: string;
  hint: string;
  url?: string;
}) {
  const trimmed = String(url || "").trim();
  return (
    <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
      {trimmed ? (
        <a href={trimmed} target="_blank" rel="noreferrer" className="block group">
          <img
            src={trimmed}
            alt={label}
            className="h-36 w-full rounded-xl border border-slate-200 object-cover transition group-hover:opacity-90 dark:border-slate-700"
          />
          <span className="mt-2 inline-flex text-xs font-semibold text-teal-700 dark:text-teal-300">
            Open full image
          </span>
        </a>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-950">
          Not uploaded
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const { t } = useI18n();
  const { showError, showSuccess } = useToast();
  const [token, setToken] = useState<string>(() => localStorage.getItem(ADMIN_TOKEN_KEY) || "");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ApprovalStatus>("pending");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [loadingSellerDetail, setLoadingSellerDetail] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  async function loadSellers(nextStatus: ApprovalStatus = status) {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get<{ sellers: Seller[] }>("/admin/sellers", {
        params: { status: nextStatus },
        headers: authHeaders,
      });
      setSellers(response.data.sellers);
    } catch {
      setError("Unable to fetch sellers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSellers(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status]);

  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);

  useEffect(() => {
    if (success) showSuccess(success);
  }, [showSuccess, success]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }
    setSubmittingLogin(true);
    try {
      const response = await api.post<{ token: string }>("/admin/login", {
        username: username.trim(),
        password,
      });
      localStorage.setItem(ADMIN_TOKEN_KEY, response.data.token);
      setToken(response.data.token);
      setSuccess("Admin logged in.");
      setPassword("");
    } catch {
      setError("Invalid admin credentials.");
    } finally {
      setSubmittingLogin(false);
    }
  }

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken("");
    setSellers([]);
    setSelectedSeller(null);
    setSuccess("");
  }

  async function openSellerDetail(seller: Seller) {
    setSelectedSeller(seller);
    if (!token) return;

    setLoadingSellerDetail(true);
    try {
      const response = await api.get<{ seller: Seller }>(`/admin/sellers/${seller._id}`, {
        headers: authHeaders,
      });
      setSelectedSeller(response.data.seller);
    } catch {
      setError("Unable to load full seller details.");
    } finally {
      setLoadingSellerDetail(false);
    }
  }

  function closeSellerDetail() {
    setSelectedSeller(null);
    setLoadingSellerDetail(false);
  }

  async function updateApproval(
    sellerId: string,
    nextStatus: ApprovalStatus,
    closeModal: boolean = false
  ) {
    if (!token) return;
    setError("");
    setSuccess("");
    try {
      const response = await api.patch<{ seller: Seller }>(
        `/admin/sellers/${sellerId}/approval`,
        { status: nextStatus },
        { headers: authHeaders }
      );
      setSuccess(`Seller marked as ${nextStatus}.`);
      await loadSellers(status);
      if (selectedSeller?._id === sellerId && response.data.seller) {
        setSelectedSeller(response.data.seller);
      }
      if (closeModal) {
        closeSellerDetail();
      }
    } catch {
      setError("Unable to update approval status.");
    }
  }

  const filteredSellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = sellers.filter((seller) => {
      if (!q) return true;
      return (
        seller.businessName?.toLowerCase().includes(q) ||
        seller.phone?.toLowerCase().includes(q) ||
        seller.businessEmail?.toLowerCase().includes(q)
      );
    });

    return [...result].sort((a, b) => {
      if (sortBy === "business") {
        return (a.businessName || "").localeCompare(b.businessName || "");
      }
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return sortBy === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [search, sellers, sortBy]);

  function getAdminPreviewUrl(seller: Seller) {
    if (!seller.slug) return "";
    return `${window.location.origin}/store/${seller.slug}?preview=admin`;
  }

  if (!token) {
    const usernameError = username.trim().length === 0 ? "Username is required." : "";
    const passwordError = password.trim().length === 0 ? "Password is required." : "";
    const formValid = !usernameError && !passwordError;
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 px-3 py-8 sm:px-4 sm:py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden space-y-5 lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-700 shadow-sm dark:border-sky-900/40 dark:bg-slate-950/80 dark:text-sky-300">
            <AppIcon name="policies" className="text-[14px]" />
            Admin Console
          </div>
          <h1 className="font-heading text-4xl font-bold leading-tight text-slate-900 dark:text-slate-100">
            Review and approve seller onboarding with a cleaner operational workspace.
          </h1>
          <p className="max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Sign in to manage pending sellers, inspect KYC details, and publish approval decisions from one structured dashboard.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Seller reviews", value: "Fast", icon: "orders" },
              { label: "Decision flow", value: "Clear", icon: "check" },
              { label: "KYC access", value: "Ready", icon: "policies" },
            ].map((item) => (
              <div key={item.label} className="surface-card rounded-[24px] p-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950">
                  <AppIcon name={item.icon as Parameters<typeof AppIcon>[0]["name"]} className="text-[15px]" />
                </span>
                <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
        <Card className="w-full space-y-5 p-6 sm:p-7">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/40 dark:text-teal-300">
              <AppIcon name="dashboard" className="text-[13px]" />
              Admin Access
            </div>
            <h1 className="font-heading text-3xl font-bold text-slate-900 dark:text-slate-100"> Admin {t("auth.login", "Login")}</h1>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-300">Review seller requests and approve registrations.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <InputField
              label="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              error={username.length > 0 ? usernameError : ""}
              success={username.trim().length > 0 ? "" : ""}
              required
            />
            <InputField
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              error={password.length > 0 ? passwordError : ""}
              success={password.trim().length > 0 ? "" : ""}
              required
            />
            <Button type="submit" fullWidth loading={submittingLogin} disabled={!formValid}>
              {t("auth.login", "Login")}
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-3 py-5 sm:px-4 sm:py-8">
      <header className="surface-card-strong flex flex-col items-stretch justify-between gap-4 rounded-[28px] bg-gradient-to-r from-white via-slate-50 to-sky-50/70 p-5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/85 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sky-700 dark:border-sky-900/40 dark:bg-slate-950/80 dark:text-sky-300">
            <AppIcon name="policies" className="text-[13px]" />
            Moderation Queue
          </div>
          <h1 className="mt-3 font-heading text-3xl font-bold text-slate-900 dark:text-slate-100">{t("admin.title", "Seller Approvals")}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">Search, review and approve seller onboarding requests quickly.</p>
        </div>
        <Button onClick={logout} variant="secondary" className="w-full sm:w-auto">
          <AppIcon name="logout" className="text-[14px]" />
          Logout
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Visible Sellers", value: filteredSellers.length, note: "Current filtered results", icon: "dashboard" },
          { label: "Pending", value: sellers.filter((seller) => seller.approvalStatus === "pending").length, note: "Awaiting review", icon: "pending" },
          { label: "Approved", value: sellers.filter((seller) => seller.approvalStatus === "approved").length, note: "Live seller accounts", icon: "active" },
          { label: "Rejected", value: sellers.filter((seller) => seller.approvalStatus === "rejected").length, note: "Needs follow-up", icon: "inactive" },
        ].map((item) => (
          <Card key={item.label} className="rounded-[26px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.note}</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <AppIcon name={item.icon as Parameters<typeof AppIcon>[0]["name"]} className="text-[14px]" />
              </span>
            </div>
            <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{item.value}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <InputField
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Business name, phone, email"
            hint="Filter sellers instantly"
          />
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ApprovalStatus)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="latest">Latest first</option>
              <option value="oldest">Oldest first</option>
              <option value="business">Business name A-Z</option>
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>Total shown: {filteredSellers.length}</span>
          <Button variant="secondary" onClick={() => void loadSellers(status)} className="w-full sm:w-auto">
            Refresh list
          </Button>
        </div>
      </Card>

      {/* Desktop table */}
      <Card className="hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80">
              <tr className="text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array.from({ length: 6 })].map((_, i) => (
                  <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-4" colSpan={5}>
                      <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    </td>
                  </tr>
                ))
              ) : filteredSellers.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={5}>
                    No sellers found for this filter.
                  </td>
                </tr>
              ) : (
                filteredSellers.map((seller) => (
                  <tr key={seller._id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{seller.businessName}</p>
                      {seller.businessAddress ? (
                        <p className="text-xs text-slate-500 dark:text-slate-300">{seller.businessAddress}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700 dark:text-slate-200">{seller.phone}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">{seller.businessEmail || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {new Date(seller.createdAt || "").toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusBadge((seller.approvalStatus || status) as ApprovalStatus)}`}>
                        {seller.approvalStatus || status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => void openSellerDetail(seller)}>
                          View
                        </Button>
                        <Button variant="success" className="px-2.5 py-1 text-xs" onClick={() => void updateApproval(seller._id, "approved")}>
                          Approve
                        </Button>
                        <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => void updateApproval(seller._id, "rejected")}>
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          [...Array.from({ length: 4 })].map((_, i) => (
            <Card key={i}>
              <div className="h-14 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </Card>
          ))
        ) : filteredSellers.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No sellers found for this filter.</p></Card>
        ) : (
          filteredSellers.map((seller) => (
            <Card key={seller._id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{seller.businessName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300">{seller.phone}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusBadge((seller.approvalStatus || status) as ApprovalStatus)}`}>
                  {seller.approvalStatus || status}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => void openSellerDetail(seller)}>View</Button>
                <Button variant="success" className="px-2.5 py-1 text-xs" onClick={() => void updateApproval(seller._id, "approved")}>Approve</Button>
                <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => void updateApproval(seller._id, "rejected")}>Reject</Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Seller detail modal */}
      {selectedSeller ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={closeSellerDetail}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] dark:border-slate-800 dark:bg-slate-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-white via-teal-50/60 to-sky-50/50 px-5 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                    Seller review
                  </p>
                  <h3 className="mt-1 font-heading text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                    {selectedSeller.businessName || "Unnamed business"}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>Slug: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedSeller.slug || "—"}</span></span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge((selectedSeller.approvalStatus || status) as ApprovalStatus)}`}>
                      {selectedSeller.approvalStatus || status}
                    </span>
                    {selectedSeller.createdAt ? (
                      <span>Joined {new Date(selectedSeller.createdAt).toLocaleDateString("en-IN")}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {selectedSeller.slug ? (
                    <a
                      href={getAdminPreviewUrl(selectedSeller)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                    >
                      <AppIcon name="website" className="text-[13px]" />
                      Preview store
                    </a>
                  ) : null}
                  <Button variant="secondary" onClick={closeSellerDetail} className="px-3 py-2 text-xs">
                    <AppIcon name="close" className="text-[12px]" />
                    Close
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {loadingSellerDetail ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                  Loading full seller profile…
                </div>
              ) : null}
              <SectionCard
                eyebrow="Registered details"
                title="Business profile"
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 text-sm dark:bg-teal-950/60">
                    🏢
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailCell label="Business name" value={selectedSeller.businessName} />
                  <DetailCell label="Category" value={selectedSeller.businessCategory} />
                  <DetailCell label="Business email" value={selectedSeller.businessEmail} />
                  <DetailCell label="Registered phone" value={selectedSeller.phone} />
                  <DetailCell label="GST number" value={selectedSeller.businessGST} />
                  <DetailCell label="Business address" value={selectedSeller.businessAddress} />
                </div>
              </SectionCard>

              <SectionCard
                title="Bank & payments"
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-sm dark:bg-emerald-950/50">
                    ₹
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailCell label="UPI ID" value={selectedSeller.upiId} />
                  <DetailCell label="Account holder" value={selectedSeller.bankAccountName} />
                  <DetailCell label="Bank name" value={selectedSeller.bankName} />
                  <DetailCell label="Account number" value={selectedSeller.bankAccountNumber} />
                  <DetailCell label="IFSC code" value={selectedSeller.bankIfsc} />
                </div>
              </SectionCard>

              <SectionCard
                title="Contact details"
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white">
                    <AppIcon name="phone" className="text-[10px]" />
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailCell label="WhatsApp" value={selectedSeller.whatsappNumber} />
                  <DetailCell label="Call number" value={selectedSeller.callNumber} />
                </div>
              </SectionCard>

              <SectionCard
                title="Store settings"
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-sm dark:bg-indigo-950/50">
                    <AppIcon name="store" className="text-[12px]" />
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailCell label="Payment mode" value={formatPaymentMode(selectedSeller.paymentMode)} />
                  <DetailCell label="Delivery mode" value={formatDeliveryMode(selectedSeller.deliveryMode)} />
                  <DetailCell
                    label="Default delivery charge"
                    value={
                      selectedSeller.defaultDeliveryCharge != null
                        ? `₹${selectedSeller.defaultDeliveryCharge}`
                        : ""
                    }
                  />
                  <DetailCell
                    label="Free delivery above"
                    value={
                      selectedSeller.freeDeliveryThreshold != null
                        ? `₹${selectedSeller.freeDeliveryThreshold}`
                        : ""
                    }
                  />
                  <DetailCell
                    label="Store published"
                    value={selectedSeller.storePublished ? "Yes" : "No"}
                  />
                  <DetailCell
                    label="Approved by"
                    value={selectedSeller.approvedBy}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Branding"
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 text-sm dark:bg-violet-950/50">
                    ✦
                  </span>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Business logo</p>
                    {selectedSeller.businessLogo ? (
                      <a href={selectedSeller.businessLogo} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={selectedSeller.businessLogo}
                          alt="Business logo"
                          className="h-32 w-full rounded-xl border border-slate-200 bg-white object-contain dark:border-slate-700"
                        />
                      </a>
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                        Not uploaded
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Favicon</p>
                    {selectedSeller.favicon ? (
                      <a href={selectedSeller.favicon} target="_blank" rel="noreferrer" className="inline-block">
                        <img
                          src={selectedSeller.favicon}
                          alt="Favicon"
                          className="h-24 w-24 rounded-xl border border-slate-200 bg-white object-contain dark:border-slate-700"
                        />
                      </a>
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                        Not uploaded
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="KYC documents"
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-sm dark:bg-amber-950/50">
                    🪪
                  </span>
                }
              >
                <p className="-mt-2 mb-4 text-xs text-slate-500">
                  Verify identity and address proofs before approving the store.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DocumentPreview
                    label="ID proof"
                    hint="Aadhaar, PAN, Passport, Voter ID, Driving Licence"
                    url={selectedSeller.idProofUrl}
                  />
                  <DocumentPreview
                    label="Address proof"
                    hint="Utility bill, bank statement, rental agreement"
                    url={selectedSeller.addressProofUrl}
                  />
                </div>
              </SectionCard>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailCell
                  label="Publish requested"
                  value={
                    selectedSeller.publishRequestedAt
                      ? new Date(selectedSeller.publishRequestedAt).toLocaleString("en-IN")
                      : ""
                  }
                />
                <DetailCell
                  label="Approved at"
                  value={
                    selectedSeller.approvedAt
                      ? new Date(selectedSeller.approvedAt).toLocaleString("en-IN")
                      : ""
                  }
                />
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  variant="success"
                  onClick={() => void updateApproval(selectedSeller._id, "approved", true)}
                  className="w-full sm:w-auto"
                >
                  <AppIcon name="check" className="text-[14px]" />
                  Approve
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void updateApproval(selectedSeller._id, "rejected", true)}
                  className="w-full sm:w-auto"
                >
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void updateApproval(selectedSeller._id, "pending", true)}
                  className="w-full sm:w-auto"
                >
                  Move to pending
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
