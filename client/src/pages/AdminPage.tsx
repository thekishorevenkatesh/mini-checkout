import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InputField } from "../components/ui/FormField";
import { useI18n } from "../context/I18nContext";
import type { Seller } from "../types";

type ApprovalStatus = "pending" | "approved" | "rejected";
type SortBy = "latest" | "oldest" | "business";

const ADMIN_TOKEN_KEY = "mydukan_admin_token";

function statusBadge(status: ApprovalStatus) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "rejected") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

export function AdminPage() {
  const { t } = useI18n();
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

  async function updateApproval(sellerId: string, nextStatus: ApprovalStatus) {
    if (!token) return;
    setError("");
    setSuccess("");
    try {
      await api.patch(
        `/admin/sellers/${sellerId}/approval`,
        { status: nextStatus },
        { headers: authHeaders }
      );
      setSuccess(`Seller marked as ${nextStatus}.`);
      await loadSellers(status);
      if (selectedSeller?._id === sellerId) {
        setSelectedSeller((prev) => (prev ? { ...prev, approvalStatus: nextStatus } : prev));
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
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <Card className="w-full space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Admin</p>
            <h1 className="font-heading text-2xl font-bold text-slate-900">{t("auth.login", "Login")} (Admin)</h1>
            <p className="text-sm text-slate-500 dark:text-slate-300">Review seller requests and approve registrations.</p>
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
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button type="submit" fullWidth loading={submittingLogin} disabled={!formValid}>
              {t("auth.login", "Login")} as Admin
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card dark:border-slate-700 dark:bg-slate-900/90">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">{t("admin.title", "Seller Approvals")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">Search, review and approve seller onboarding requests quickly.</p>
        </div>
        <Button onClick={logout} variant="secondary">
          Logout
        </Button>
      </header>

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
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
          <span>Total shown: {filteredSellers.length}</span>
          <Button variant="secondary" onClick={() => void loadSellers(status)}>
            Refresh list
          </Button>
        </div>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

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
                        <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setSelectedSeller(seller)}>
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
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setSelectedSeller(seller)}>View</Button>
                <Button variant="success" className="px-2.5 py-1 text-xs" onClick={() => void updateApproval(seller._id, "approved")}>Approve</Button>
                <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => void updateApproval(seller._id, "rejected")}>Reject</Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Seller detail modal */}
      {selectedSeller ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <Card className="w-full max-w-6xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Seller Details</p>
                <h3 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">{selectedSeller.businessName}</h3>
              </div>
              <Button variant="secondary" onClick={() => setSelectedSeller(null)}>Close</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Business Name</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.businessName || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Phone</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.phone}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.businessEmail || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Store Slug</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.slug || "—"}</p>
                {selectedSeller.slug ? (
                  <a
                    href={getAdminPreviewUrl(selectedSeller)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                  >
                    Open Store
                  </a>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">UPI ID</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.upiId || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">GST Number</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.businessGST || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">WhatsApp</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.whatsappNumber || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Call Number</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.callNumber || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70 md:col-span-2 xl:col-span-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Address</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.businessAddress || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Business Logo</p>
                {selectedSeller.businessLogo ? (
                  <a href={selectedSeller.businessLogo} target="_blank" rel="noreferrer" className="mt-2 block">
                    <img src={selectedSeller.businessLogo} alt="Business Logo" className="h-28 w-full rounded-xl border border-slate-200 bg-white object-contain" />
                  </a>
                ) : (
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">-</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Favicon</p>
                {selectedSeller.favicon ? (
                  <a href={selectedSeller.favicon} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                    <img src={selectedSeller.favicon} alt="Favicon" className="h-20 w-20 rounded-xl border border-slate-200 bg-white object-contain" />
                  </a>
                ) : (
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">-</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">ID Proof</p>
                {selectedSeller.idProofUrl ? (
                  <a href={selectedSeller.idProofUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                    <img src={selectedSeller.idProofUrl} alt="ID Proof" className="h-32 w-full rounded-xl border border-slate-200 object-cover" />
                  </a>
                ) : (
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">-</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Address Proof</p>
                {selectedSeller.addressProofUrl ? (
                  <a href={selectedSeller.addressProofUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                    <img src={selectedSeller.addressProofUrl} alt="Address Proof" className="h-32 w-full rounded-xl border border-slate-200 object-cover" />
                  </a>
                ) : (
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">-</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Registered</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{new Date(selectedSeller.createdAt || "").toLocaleString("en-IN")}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Current status</p>
                <span className={`mt-1 inline-block rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusBadge((selectedSeller.approvalStatus || status) as ApprovalStatus)}`}>
                  {selectedSeller.approvalStatus || status}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Approved By</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedSeller.approvedBy || "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-xs uppercase tracking-wide text-slate-500">Approved At</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {selectedSeller.approvedAt ? new Date(selectedSeller.approvedAt).toLocaleString("en-IN") : "—"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="success" onClick={() => void updateApproval(selectedSeller._id, "approved")}>Approve</Button>
              <Button variant="danger" onClick={() => void updateApproval(selectedSeller._id, "rejected")}>Reject</Button>
              <Button variant="secondary" onClick={() => void updateApproval(selectedSeller._id, "pending")}>Move to Pending</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
