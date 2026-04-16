import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_POLICY_CONTENT } from "../constants/policyDefaults";
import type { Order, OrderStatus, Product, SocialLink, Banner, PaymentMode } from "../types";

type Tab = "dashboard" | "store" | "products" | "orders" | "reports" | "profile" | "policies";
type ProductFormVariant = {
  label: string;
  options: string;
  optionPrices: Record<string, string>;
};

type ProductForm = {
  title: string; description: string; price: string; mrp: string;
  imageUrl: string; notes: string; category: string;
  variants: ProductFormVariant[];
};

const emptyProductForm: ProductForm = {
  title: "", description: "", price: "", mrp: "",
  imageUrl: "", notes: "", category: "", variants: [],
};

const statusClasses: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-sky-100 text-sky-700 border-sky-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

const SOCIAL_PLATFORMS = ["Instagram", "Facebook", "Twitter/X", "YouTube", "LinkedIn", "Website", "Other"];

const IMGBB_KEY = import.meta.env.VITE_IMGBB_API_KEY as string | undefined;

// ─── Reusable image upload field ─────────────────────────────────────────────
function ImageUploadField({
  value,
  onChange,
  placeholder = "https://...",
}: {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMGBB_KEY) {
      setUploadError("Add VITE_IMGBB_API_KEY to client/.env to enable uploads.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json() as { success: boolean; data?: { url: string } };
      if (data.success && data.data?.url) {
        onChange(data.data.url);
      } else {
        setUploadError("Upload failed. Check your ImgBB API key.");
      }
    } catch {
      setUploadError("Upload failed. Check your internet connection.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <label
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 ${uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? "⏳" : "📁"} {uploading ? "Uploading…" : "Upload"}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </div>
      {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(date: Date | null): string {
  if (!date) return "";
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function getVariantPriceKey(label: string, option: string) {
  return `${label}::${option}`;
}

function parseVariantOptions(options: string) {
  return options.split(",").map(option => option.trim()).filter(Boolean);
}

// ─── DashboardPage ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { seller, logout, updateProfile, refreshProfile } = useAuth();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── Product form + edit mode
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);

  // ── Profile form
  const [profileName, setProfileName] = useState(seller?.businessName || "");
  const [profileEmail, setProfileEmail] = useState(seller?.businessEmail || "");
  const [profileUpi, setProfileUpi] = useState(seller?.upiId || "");
  const [profileAddress, setProfileAddress] = useState(seller?.businessAddress || "");
  const [profileGST, setProfileGST] = useState(seller?.businessGST || "");
  const [profileLogo, setProfileLogo] = useState(seller?.businessLogo || "");
  const [profileFavicon, setProfileFavicon] = useState(seller?.favicon || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [privacyPolicy, setPrivacyPolicy] = useState<string>(DEFAULT_POLICY_CONTENT.privacyPolicy);
  const [returnRefundPolicy, setReturnRefundPolicy] = useState<string>(DEFAULT_POLICY_CONTENT.returnRefundPolicy);
  const [termsAndConditions, setTermsAndConditions] = useState<string>(DEFAULT_POLICY_CONTENT.termsAndConditions);
  const [isSavingPolicies, setIsSavingPolicies] = useState(false);

  // ── Store options
  const [storeLogo, setStoreLogo] = useState(seller?.businessLogo || "");
  const [storeFavicon, setStoreFavicon] = useState(seller?.favicon || "");
  const [storeWhatsapp, setStoreWhatsapp] = useState(seller?.whatsappNumber || "");
  const [storeCall, setStoreCall] = useState(seller?.callNumber || "");
  const [storeDeliveryMode, setStoreDeliveryMode] = useState<"always_free" | "flat_rate">(seller?.deliveryMode || "always_free");
  const [storeDeliveryCharge, setStoreDeliveryCharge] = useState<string>(String(seller?.defaultDeliveryCharge ?? 0));
  const [storeFreeDeliveryThreshold, setStoreFreeDeliveryThreshold] = useState<string>(String(seller?.freeDeliveryThreshold ?? 500));
  const [storePaymentMode, setStorePaymentMode] = useState<PaymentMode>(seller?.paymentMode || "prepaid_only");
  const [banners, setBanners] = useState<Banner[]>(seller?.banners || []);
  const [newBannerUrl, setNewBannerUrl] = useState("");
  const [newBannerTitle, setNewBannerTitle] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(seller?.socialLinks || []);
  const [newSocialPlatform, setNewSocialPlatform] = useState("Instagram");
  const [newSocialUrl, setNewSocialUrl] = useState("");
  const [isSavingStore, setIsSavingStore] = useState(false);

  // ── Categories
  const [categories, setCategories] = useState<string[]>(seller?.categories || []);
  const [newCategory, setNewCategory] = useState("");

  // ── Reports
  const [reportDays, setReportDays] = useState(30);
  const [report, setReport] = useState<{
    totalOrders: number; totalRevenue: number;
    topProducts: { title: string; unitsSold: number; revenue: number }[];
  } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // ── Real-time order refresh
  const ordersIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ordersLastUpdated, setOrdersLastUpdated] = useState<Date | null>(null);
  const [, forceTickUpdate] = useState(0); // triggers re-render for "X ago" display

  const [copyFeedback, setCopyFeedback] = useState("");

  // Sync seller into local form state
  useEffect(() => {
    if (!seller) return;
    setProfileName(seller.businessName || "");
    setProfileEmail(seller.businessEmail || "");
    setProfileUpi(seller.upiId || "");
    setProfileAddress(seller.businessAddress || "");
    setProfileGST(seller.businessGST || "");
    setProfileLogo(seller.businessLogo || "");
    setProfileFavicon(seller.favicon || "");
    setStoreLogo(seller.businessLogo || "");
    setStoreFavicon(seller.favicon || "");
    setStoreWhatsapp(seller.whatsappNumber || "");
    setStoreCall(seller.callNumber || "");
    setStoreDeliveryMode(seller.deliveryMode || "always_free");
    setStoreDeliveryCharge(String(seller.defaultDeliveryCharge ?? 0));
    setStoreFreeDeliveryThreshold(String(seller.freeDeliveryThreshold ?? 500));
    setStorePaymentMode(seller.paymentMode || "prepaid_only");
    setBanners(seller.banners || []);
    setSocialLinks(seller.socialLinks || []);
    setCategories(seller.categories || []);
    setPrivacyPolicy(seller.privacyPolicy || DEFAULT_POLICY_CONTENT.privacyPolicy);
    setReturnRefundPolicy(seller.returnRefundPolicy || DEFAULT_POLICY_CONTENT.returnRefundPolicy);
    setTermsAndConditions(seller.termsAndConditions || DEFAULT_POLICY_CONTENT.termsAndConditions);
  }, [seller]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [pr, or] = await Promise.all([
        api.get<{ products: Product[] }>("/products/my"),
        api.get<{ orders: Order[] }>("/orders/my"),
      ]);
      setProducts(pr.data.products);
      setOrders(or.data.orders);
      setOrdersLastUpdated(new Date());
    } catch { setError("Could not load dashboard data."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, []);

  // ── Auto-refresh orders every 30s when on orders tab
  useEffect(() => {
    if (tab === "orders") {
      // Refresh once immediately when switching to tab
      void loadData();
      ordersIntervalRef.current = setInterval(() => void loadData(), 30_000);
      // Tick for "X ago" label every 5s
      const tickInterval = setInterval(() => forceTickUpdate(n => n + 1), 5_000);
      return () => {
        clearInterval(ordersIntervalRef.current!);
        clearInterval(tickInterval);
        ordersIntervalRef.current = null;
      };
    }
    // Clear interval when leaving orders tab
    if (ordersIntervalRef.current) {
      clearInterval(ordersIntervalRef.current);
      ordersIntervalRef.current = null;
    }
  }, [tab]);

  async function loadReport() {
    setLoadingReport(true);
    try {
      const r = await api.get<{
        totalOrders: number; totalRevenue: number;
        topProducts: { title: string; unitsSold: number; revenue: number }[];
      }>(`/orders/my/report?days=${reportDays}`);
      setReport(r.data);
    } catch { setError("Could not load report."); }
    finally { setLoadingReport(false); }
  }

  useEffect(() => { if (tab === "reports") void loadReport(); }, [tab, reportDays]);

  const stats = useMemo(() => {
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400000);
    const d30 = new Date(now - 30 * 86400000);
    const recent7 = orders.filter(o => new Date(o.createdAt) >= d7 && o.paymentStatus !== "cancelled");
    const recent30 = orders.filter(o => new Date(o.createdAt) >= d30 && o.paymentStatus !== "cancelled");
    return {
      totalProducts: products.length,
      totalOrders: orders.length,
      pending: orders.filter(o => o.paymentStatus === "pending").length,
      confirmed: orders.filter(o => o.paymentStatus === "confirmed").length,
      value7d: recent7.reduce((s, o) => s + o.amount + (o.deliveryCharge || 0), 0),
      value30d: recent30.reduce((s, o) => s + o.amount + (o.deliveryCharge || 0), 0),
    };
  }, [orders, products.length]);

  const storeUrl = useMemo(() => {
    if (!seller?.slug) return "";
    return `${window.location.origin}/store/${seller.slug}`;
  }, [seller?.slug]);

  async function copyStoreLink() {
    if (!storeUrl) return;
    await navigator.clipboard.writeText(storeUrl);
    setCopyFeedback("Store link copied!"); window.setTimeout(() => setCopyFeedback(""), 2000);
  }

  // ── Profile save
  async function handleProfileSave(e: FormEvent) {
    e.preventDefault(); setIsSavingProfile(true); setError(""); setSuccess("");
    try {
      await updateProfile({
        businessName: profileName.trim(), businessEmail: profileEmail.trim(),
        upiId: profileUpi.trim(), businessAddress: profileAddress.trim(),
        businessGST: profileGST.trim(), businessLogo: profileLogo.trim(),
        favicon: profileFavicon.trim(),
      });
      setSuccess("Profile saved.");
    } catch { setError("Could not save profile."); }
    finally { setIsSavingProfile(false); }
  }

  // ── Store options save
  async function handleStoreSave() {
    setIsSavingStore(true); setError(""); setSuccess("");
    try {
      await api.put("/store/options", {
        businessLogo: storeLogo.trim(),
        favicon: storeFavicon.trim(),
        whatsappNumber: storeWhatsapp.trim(),
        callNumber: storeCall.trim(),
        banners, socialLinks, categories,
        deliveryMode: storeDeliveryMode,
        defaultDeliveryCharge: Math.max(0, Number(storeDeliveryCharge) || 0),
        freeDeliveryThreshold: Math.max(0, Number(storeFreeDeliveryThreshold) || 0),
        paymentMode: storePaymentMode,
      });
      await refreshProfile();
      setSuccess("Store options saved.");
    } catch { setError("Could not save store options."); }
    finally { setIsSavingStore(false); }
  }

  async function handlePoliciesSave(e: FormEvent) {
    e.preventDefault();
    setIsSavingPolicies(true); setError(""); setSuccess("");
    try {
      await updateProfile({
        privacyPolicy: privacyPolicy.trim(),
        returnRefundPolicy: returnRefundPolicy.trim(),
        termsAndConditions: termsAndConditions.trim(),
      });
      setSuccess("Policies saved.");
    } catch {
      setError("Could not save policies.");
    } finally {
      setIsSavingPolicies(false);
    }
  }

  // ── Product: start edit
  function handleStartEdit(prod: Product) {
    setEditingProduct(prod);
    setProductForm({
      title: prod.title,
      description: prod.description || "",
      price: String(prod.price),
      mrp: String(prod.mrp || ""),
      imageUrl: prod.imageUrl || "",
      notes: prod.notes || "",
      category: prod.category || "",
      variants: (prod.variants || []).map(v => {
        const optionPrices = v.options.reduce<Record<string, string>>((acc, option) => {
          const price = prod.variantPrices?.[getVariantPriceKey(v.label, option)];
          if (price) {
            acc[option] = String(price);
          }
          return acc;
        }, {});

        return { label: v.label, options: v.options.join(", "), optionPrices };
      }),
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Product: cancel edit
  function handleCancelEdit() {
    setEditingProduct(null);
    setProductForm(emptyProductForm);
  }

  // ── Product: create or update
  async function handleSubmitProduct(e: FormEvent) {
    e.preventDefault(); setIsSubmittingProduct(true); setError(""); setSuccess("");
    try {
      const variantPayload = productForm.variants
        .filter(v => v.label.trim())
        .map(v => ({
          label: v.label.trim(),
          options: parseVariantOptions(v.options),
        }));

      const hasVariants = variantPayload.some(v => v.options.length > 0);
      const variantPrices = productForm.variants.reduce<Record<string, number>>((acc, variant) => {
        const label = variant.label.trim();
        const options = parseVariantOptions(variant.options);

        options.forEach(option => {
          const price = Number(variant.optionPrices[option]);
          if (label && Number.isFinite(price) && price > 0) {
            acc[getVariantPriceKey(label, option)] = price;
          }
        });

        return acc;
      }, {});

      if (hasVariants) {
        const missingPrice = variantPayload.some(variant =>
          variant.options.some(option => !variantPrices[getVariantPriceKey(variant.label, option)])
        );

        if (missingPrice) {
          setError("Enter a specific price for every variant option.");
          setIsSubmittingProduct(false);
          return;
        }
      }

      const payload = {
        title: productForm.title.trim(),
        description: productForm.description.trim(),
        price: Number(productForm.price),
        mrp: Number(productForm.mrp) || 0,
        imageUrl: productForm.imageUrl.trim(),
        notes: productForm.notes.trim(),
        category: productForm.category.trim(),
        variants: variantPayload,
        variantPrices,
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct._id}`, payload);
        setSuccess("Product updated.");
        setEditingProduct(null);
      } else {
        await api.post("/products", payload);
        if (productForm.category.trim() && !categories.includes(productForm.category.trim())) {
          setCategories(prev => [...prev, productForm.category.trim()]);
        }
        setSuccess("Product added.");
      }
      setProductForm(emptyProductForm);
      await loadData();
    } catch { setError(editingProduct ? "Could not update product." : "Could not create product."); }
    finally { setIsSubmittingProduct(false); }
  }

  // ── Product toggle / delete
  async function handleToggleProduct(id: string) {
    try { await api.patch(`/products/${id}/toggle`, {}); await loadData(); }
    catch { setError("Could not toggle product."); }
  }
  async function handleDeleteProduct(id: string) {
    if (!window.confirm("Delete this product? This cannot be undone.")) return;
    try { await api.delete(`/products/${id}`); await loadData(); setSuccess("Product deleted."); }
    catch { setError("Could not delete product."); }
  }

  // ── Order status
  async function handleOrderStatus(orderId: string, status: OrderStatus) {
    try { await api.patch(`/orders/${orderId}/status`, { status }); await loadData(); }
    catch { setError("Could not update status."); }
  }

  // ── CSV export
  function handleExport() {
    window.open(`${api.defaults.baseURL}/orders/my/export`, "_blank");
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "📊 Dashboard" },
    { key: "store", label: "🏪 Store Options" },
    { key: "products", label: "📦 Products" },
    { key: "orders", label: "🧾 Orders" },
    { key: "reports", label: "📈 Reports" },
    { key: "profile", label: "👤 Profile" },
    { key: "policies", label: "📄 Policies" },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-3 py-5 sm:px-4 sm:py-8">
      {/* Header */}
      <header className="flex flex-col gap-3 rounded-3xl border border-white/70 bg-white/80 p-4 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          {seller?.businessLogo && (
            <img src={seller.businessLogo} alt="logo" className="h-10 w-10 rounded-xl object-contain border border-slate-200" />
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">🛍️ MyDukan</p>
            <h1 className="font-heading text-xl font-bold text-slate-900 sm:text-2xl">{seller?.businessName || "My Dukan"}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyStoreLink} disabled={!storeUrl} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:bg-slate-300 disabled:text-slate-500 transition">Copy Store Link</button>
          {storeUrl && (
            <a href={storeUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition">Open Store</a>
          )}
          <button onClick={logout} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 transition">Logout</button>
        </div>
      </header>

      {/* Feedback banners */}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
      {success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</p>}
      {copyFeedback && <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">{copyFeedback}</p>}

      {/* Tab nav */}
      <nav className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setError(""); setSuccess(""); }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ═════════════════════════════════════ TAB: DASHBOARD ══ */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Products", value: stats.totalProducts, color: "text-slate-900" },
              { label: "Total Orders", value: stats.totalOrders, color: "text-slate-900" },
              { label: "Pending", value: stats.pending, color: "text-amber-600" },
              { label: "Confirmed", value: stats.confirmed, color: "text-emerald-600" },
            ].map(s => (
              <article key={s.label} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{s.label}</p>
                <p className={`mt-1 text-3xl font-bold ${s.color}`}>{s.value}</p>
              </article>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Revenue — Last 7 Days</p>
              <p className="mt-1 text-3xl font-bold text-teal-700">₹{stats.value7d.toLocaleString("en-IN")}</p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Revenue — Last 30 Days</p>
              <p className="mt-1 text-3xl font-bold text-teal-700">₹{stats.value30d.toLocaleString("en-IN")}</p>
            </article>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Your Public Store Link</p>
            <a href={storeUrl || "#"} target="_blank" rel="noreferrer"
              className={`mt-1 block break-all text-sm ${storeUrl ? "font-semibold text-teal-700 underline-offset-2 hover:underline" : "text-slate-400"}`}>
              {storeUrl || "Store link will appear once profile is complete"}
            </a>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════ TAB: STORE OPTIONS ══ */}
      {tab === "store" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Branding */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-4">
            <h2 className="font-heading text-xl font-bold text-slate-900">Branding & Contact</h2>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Business Logo URL</span>
              <ImageUploadField value={storeLogo} onChange={setStoreLogo} placeholder="https://..." />
            </label>
            {storeLogo && <img src={storeLogo} alt="logo preview" className="h-16 w-16 rounded-xl object-contain border border-slate-200" />}
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Favicon URL</span>
              <ImageUploadField value={storeFavicon} onChange={setStoreFavicon} placeholder="https://..." />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">WhatsApp Number</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeWhatsapp} onChange={e => setStoreWhatsapp(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Call Number</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeCall} onChange={e => setStoreCall(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Delivery Option</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 bg-white"
                value={storeDeliveryMode}
                onChange={e => setStoreDeliveryMode(e.target.value as "always_free" | "flat_rate")}
              >
                <option value="always_free">Free Delivery</option>
                <option value="flat_rate">Flat Charge with Free Above Billing Amount</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Payment Option</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 bg-white"
                value={storePaymentMode}
                onChange={e => setStorePaymentMode(e.target.value as PaymentMode)}
              >
                <option value="prepaid_only">UPI / Pay Before Order</option>
                <option value="cod_only">Cash on Delivery Only</option>
                <option value="both">Allow Both Prepaid and Cash on Delivery</option>
              </select>
              <p className="text-xs text-slate-500">This controls what the customer can choose during checkout.</p>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Default Delivery Charge (₹)</span>
              <input
                type="number" min={0}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                placeholder="0"
                value={storeDeliveryCharge}
                onChange={e => {
                  const v = e.target.value;
                  if (v === "") { setStoreDeliveryCharge(""); return; }
                  setStoreDeliveryCharge(String(Math.max(0, Number(v) || 0)));
                }}
                disabled={storeDeliveryMode === "always_free"}
              />
              <p className="text-xs text-slate-500">
                {storeDeliveryMode === "always_free"
                  ? "Customers will always see free delivery."
                  : "This flat charge applies until the free-delivery threshold is reached."}
              </p>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Free Delivery Above Billing Amount (₹)</span>
              <input
                type="number" min={0}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                placeholder="500"
                value={storeFreeDeliveryThreshold}
                onChange={e => {
                  const v = e.target.value;
                  if (v === "") { setStoreFreeDeliveryThreshold(""); return; }
                  setStoreFreeDeliveryThreshold(String(Math.max(0, Number(v) || 0)));
                }}
                disabled={storeDeliveryMode === "always_free"}
              />
              <p className="text-xs text-slate-500">
                {storeDeliveryMode === "always_free"
                  ? "Threshold is ignored when delivery is always free."
                  : "If the customer billing amount reaches this value, delivery becomes free."}
              </p>
            </label>
          </article>

          {/* Banners */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-3">
            <h2 className="font-heading text-xl font-bold text-slate-900">Banners</h2>
            <div className="space-y-2">
              {banners.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {b.imageUrl && <img src={b.imageUrl} alt="" className="h-12 w-20 rounded-lg object-cover" />}
                  <p className="flex-1 text-xs text-slate-700 break-all">{b.title || b.imageUrl}</p>
                  <button onClick={() => setBanners(prev => prev.filter((_, j) => j !== i))} className="text-rose-600 text-xs font-semibold px-2 py-1 rounded-lg border border-rose-200 bg-rose-50">Remove</button>
                </div>
              ))}
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Banner Image</span>
                <ImageUploadField value={newBannerUrl} onChange={setNewBannerUrl} placeholder="Banner Image URL" />
              </label>
              <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" placeholder="Banner title (optional)" value={newBannerTitle} onChange={e => setNewBannerTitle(e.target.value)} />
              <button
                onClick={() => {
                  if (newBannerUrl.trim()) {
                    setBanners(prev => [...prev, { imageUrl: newBannerUrl.trim(), title: newBannerTitle.trim() }]);
                    setNewBannerUrl(""); setNewBannerTitle("");
                  }
                }}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
              >+ Add Banner</button>
            </div>
          </article>

          {/* Social Links */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-3">
            <h2 className="font-heading text-xl font-bold text-slate-900">Social Links</h2>
            {socialLinks.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
                <span className="font-semibold text-slate-700 w-24 shrink-0">{s.platform}</span>
                <span className="flex-1 text-slate-500 truncate">{s.url}</span>
                <button onClick={() => setSocialLinks(prev => prev.filter((_, j) => j !== i))} className="text-rose-600 text-xs font-semibold px-2 py-1 rounded-lg border border-rose-200 bg-rose-50">✕</button>
              </div>
            ))}
            <div className="flex gap-2">
              <select className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none" value={newSocialPlatform} onChange={e => setNewSocialPlatform(e.target.value)}>
                {SOCIAL_PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
              <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" placeholder="https://..." value={newSocialUrl} onChange={e => setNewSocialUrl(e.target.value)} />
              <button
                onClick={() => { if (newSocialUrl.trim()) { setSocialLinks(prev => [...prev, { platform: newSocialPlatform, url: newSocialUrl.trim() }]); setNewSocialUrl(""); } }}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
              >Add</button>
            </div>
          </article>

          {/* Categories */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-3">
            <h2 className="font-heading text-xl font-bold text-slate-900">Product Categories</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((c, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                  {c}
                  <button onClick={() => setCategories(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" placeholder="e.g. Food, Clothing..." value={newCategory} onChange={e => setNewCategory(e.target.value)} />
              <button
                onClick={() => { const c = newCategory.trim(); if (c && !categories.includes(c)) { setCategories(prev => [...prev, c]); setNewCategory(""); } }}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
              >Add</button>
            </div>
          </article>

          <div className="lg:col-span-2">
            <button onClick={handleStoreSave} disabled={isSavingStore}
              className="w-full rounded-2xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-teal-500 disabled:bg-teal-300 transition">
              {isSavingStore ? "Saving Store Options..." : "Save All Store Options"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ TAB: PRODUCTS ══ */}
      {tab === "products" && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Add / Edit product form */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card lg:col-span-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-xl font-bold text-slate-900">
                {editingProduct ? "✏️ Edit Product" : "Add New Product"}
              </h2>
              {editingProduct && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  ✕ Cancel Edit
                </button>
              )}
            </div>

            {editingProduct && (
              <p className="mt-1 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700">
                Editing: <strong>{editingProduct.title}</strong>
              </p>
            )}

            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSubmitProduct}>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Product title *</span>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="Home-made Ragi Laddu" value={productForm.title}
                  onChange={e => setProductForm(p => ({ ...p, title: e.target.value }))} required />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Selling Price (₹) *</span>
                <input type="number" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="499" value={productForm.price}
                  onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))} required />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">MRP (₹)</span>
                <input type="number" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="599" value={productForm.mrp}
                  onChange={e => setProductForm(p => ({ ...p, mrp: e.target.value }))} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Category</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 bg-white"
                  value={productForm.category}
                  onChange={e => setProductForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="">-- Select --</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Product Image</span>
                <ImageUploadField
                  value={productForm.imageUrl}
                  onChange={url => setProductForm(p => ({ ...p, imageUrl: url }))}
                  placeholder="https://..."
                />
              </label>
              {productForm.imageUrl && (
                <div className="sm:col-span-2">
                  <img src={productForm.imageUrl} alt="preview" className="h-24 w-24 rounded-xl object-cover border border-slate-200" />
                </div>
              )}
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Description</span>
                <textarea className="min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="What does the customer get?" value={productForm.description}
                  onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Additional Info (Notes)</span>
                <textarea className="min-h-12 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="Delivery info, pickup details..." value={productForm.notes}
                  onChange={e => setProductForm(p => ({ ...p, notes: e.target.value }))} />
              </label>

              {/* Variants */}
              <div className="sm:col-span-2 space-y-2">
                <p className="text-sm font-semibold text-slate-700">Variants (e.g. Size, Color)</p>
                {productForm.variants.map((v, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex gap-2">
                      <input className="w-28 rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none" placeholder="Size" value={v.label}
                        onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], label: e.target.value }; return { ...p, variants: vv }; })} />
                      <input className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none" placeholder="S, M, L, XL"
                        value={v.options}
                        onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], options: e.target.value }; return { ...p, variants: vv }; })} />
                      <button type="button" onClick={() => setProductForm(p => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }))}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 text-rose-600 text-sm">✕</button>
                    </div>
                    {parseVariantOptions(v.options).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Option Prices</p>
                        {parseVariantOptions(v.options).map(option => (
                          <div key={option} className="flex items-center gap-2">
                            <span className="min-w-24 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700">{option}</span>
                            <input
                              type="number"
                              min={1}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                              placeholder={`Price for ${option}`}
                              value={v.optionPrices[option] || ""}
                              onChange={e => setProductForm(p => {
                                const vv = [...p.variants];
                                vv[i] = {
                                  ...vv[i],
                                  optionPrices: { ...vv[i].optionPrices, [option]: e.target.value },
                                };
                                return { ...p, variants: vv };
                              })}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-xs text-slate-500">If you add variants, each option must have its own selling price.</p>
                <button type="button" onClick={() => setProductForm(p => ({ ...p, variants: [...p.variants, { label: "", options: "", optionPrices: {} }] }))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition">+ Add Variant</button>
              </div>

              <button type="submit" disabled={isSubmittingProduct}
                className={`sm:col-span-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${editingProduct ? "bg-amber-600 hover:bg-amber-500" : "bg-teal-600 hover:bg-teal-500"}`}>
                {isSubmittingProduct
                  ? (editingProduct ? "Saving…" : "Adding...")
                  : (editingProduct ? "💾 Save Changes" : "Add Product")}
              </button>
            </form>
          </article>

          {/* Product catalog */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card lg:col-span-2">
            <h2 className="font-heading text-xl font-bold text-slate-900">Product Catalog</h2>
            {loading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
            {!loading && products.length === 0 && <p className="mt-4 text-sm text-slate-500">No products yet.</p>}
            <div className="mt-4 space-y-3">
              {products.map(prod => (
                <div key={prod._id} className={`rounded-2xl border p-3 ${prod.isActive ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-100 opacity-60"}`}>
                  <div className="flex items-start gap-2">
                    {prod.imageUrl && <img src={prod.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{prod.title}</p>
                      {prod.category && <p className="text-xs text-slate-500">{prod.category}</p>}
                      <div className="flex gap-2 mt-1">
                        <span className="text-sm font-bold text-slate-900">₹{prod.price}</span>
                        {prod.mrp > 0 && prod.mrp > prod.price && (
                          <span className="text-xs text-slate-400 line-through self-center">₹{prod.mrp}</span>
                        )}
                      </div>
                      {prod.variants.some(v => v.options.length > 0) && (
                        <div className="mt-2 space-y-1">
                          {prod.variants.map(variant => (
                            <p key={variant.label} className="text-xs text-slate-500">
                              {variant.label}: {variant.options.map(option => {
                                const variantPrice = prod.variantPrices?.[getVariantPriceKey(variant.label, option)];
                                return variantPrice ? `${option} (₹${variantPrice})` : option;
                              }).join(", ")}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleStartEdit(prod)}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition"
                    >
                      ✏️ Edit
                    </button>
                    <button onClick={() => handleToggleProduct(prod._id)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${prod.isActive ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"}`}>
                      {prod.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDeleteProduct(prod._id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}

      {/* ═══════════════════════════════════════ TAB: ORDERS ══ */}
      {tab === "orders" && (
        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-bold text-slate-900">Incoming Orders</h2>
            <div className="flex items-center gap-3">
              {ordersLastUpdated && (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live · {timeAgo(ordersLastUpdated)}
                </span>
              )}
              <button
                onClick={() => void loadData()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {loading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
          {!loading && orders.length === 0 && <p className="mt-4 text-sm text-slate-500">No orders yet.</p>}

          {/* Mobile cards */}
          {orders.length > 0 && (
            <div className="mt-4 space-y-3 md:hidden">
              {orders.map(order => (
                <article key={order._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{order.customerName}</p>
                      <p className="text-xs text-slate-500">{order.customerPhone}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[order.paymentStatus]}`}>{order.paymentStatus}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">Product: {order.product?.title || "—"}</p>
                  {order.selectedVariants && Object.keys(order.selectedVariants).length > 0 && (
                    <p className="text-xs text-slate-500">Variants: {Object.entries(order.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>
                  )}
                  <p className="text-xs text-slate-500">Qty: {order.quantity} · Items: ₹{order.amount} · Delivery: ₹{order.deliveryCharge || 0} · Total: ₹{order.amount + (order.deliveryCharge || 0)}</p>
                  {order.deliveryAddress && <p className="mt-1 text-xs text-slate-500">📍 {order.deliveryAddress}</p>}
                  {order.paymentScreenshotUrl && (
                    <a href={order.paymentScreenshotUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-teal-700 underline">View Payment Proof</a>
                  )}
                  <select className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none"
                    value={order.paymentStatus} onChange={e => handleOrderStatus(order._id, e.target.value as OrderStatus)}>
                    {["pending", "paid", "confirmed", "cancelled"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </article>
              ))}
            </div>
          )}

          {/* Desktop table */}
          {orders.length > 0 && (
            <div className="hidden overflow-auto md:block mt-4">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="pb-2 pr-4">Customer</th><th className="pb-2 pr-4">Product</th>
                  <th className="pb-2 pr-4">Variants</th><th className="pb-2 pr-4">Qty</th>
                  <th className="pb-2 pr-4">Items</th><th className="pb-2 pr-4">Delivery</th>
                  <th className="pb-2 pr-4">Total</th><th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Proof</th><th className="pb-2">Update</th>
                </tr></thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order._id} className="border-b border-slate-100">
                      <td className="py-3 pr-4"><p className="font-semibold text-slate-800">{order.customerName}</p><p className="text-xs text-slate-500">{order.customerPhone}</p>{order.deliveryAddress && <p className="text-xs text-slate-400">📍 {order.deliveryAddress}</p>}</td>
                      <td className="py-3 pr-4 text-slate-700">{order.product?.title || "—"}</td>
                      <td className="py-3 pr-4 text-xs text-slate-500">{order.selectedVariants ? Object.entries(order.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ") : "—"}</td>
                      <td className="py-3 pr-4 text-slate-700">{order.quantity}</td>
                      <td className="py-3 pr-4 text-slate-700">₹{order.amount}</td>
                      <td className="py-3 pr-4 text-slate-700">₹{order.deliveryCharge || 0}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">₹{order.amount + (order.deliveryCharge || 0)}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[order.paymentStatus]}`}>{order.paymentStatus}</span></td>
                      <td className="py-3 pr-4">{order.paymentScreenshotUrl ? <a href={order.paymentScreenshotUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-700 underline">View</a> : <span className="text-xs text-slate-400">None</span>}</td>
                      <td className="py-3">
                        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none" value={order.paymentStatus} onChange={e => handleOrderStatus(order._id, e.target.value as OrderStatus)}>
                          {["pending", "paid", "confirmed", "cancelled"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}

      {/* ══════════════════════════════════════ TAB: REPORTS ══ */}
      {tab === "reports" && (
        <div className="space-y-4">
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-bold text-slate-900">Sales Report</h2>
              <div className="flex gap-2">
                {[7, 30].map(d => (
                  <button key={d} onClick={() => setReportDays(d)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${reportDays === d ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
                    {d === 7 ? "7 Days" : "30 Days"}
                  </button>
                ))}
                <button onClick={handleExport} className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition">⬇ Export CSV</button>
              </div>
            </div>
            {loadingReport && <p className="mt-4 text-sm text-slate-500">Loading report...</p>}
            {report && !loadingReport && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Orders ({reportDays}d)</p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">{report.totalOrders}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Revenue ({reportDays}d)</p>
                    <p className="mt-1 text-3xl font-bold text-teal-700">₹{report.totalRevenue.toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <h3 className="mt-5 text-sm font-bold text-slate-700">Top Selling Products</h3>
                {report.topProducts.length === 0 && <p className="mt-2 text-sm text-slate-500">No sales data for this period.</p>}
                <div className="mt-2 space-y-2">
                  {report.topProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-300">#{i + 1}</span>
                        <p className="font-semibold text-slate-800">{p.title}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{p.unitsSold} units sold</p>
                        <p className="text-xs text-teal-700">₹{p.revenue.toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
        </div>
      )}

      {/* ══════════════════════════════════════ TAB: PROFILE ══ */}
      {tab === "profile" && (
        <article className="mx-auto max-w-2xl rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
          <h2 className="font-heading text-xl font-bold text-slate-900">Seller Profile</h2>
          <p className="mt-1 text-xs text-slate-500">Store slug: <span className="font-semibold">{seller?.slug}</span></p>
          <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={handleProfileSave}>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Business name *</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" value={profileName} onChange={e => setProfileName(e.target.value)} required />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Business email</span>
              <input type="email" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">UPI ID</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="yourname@upi" value={profileUpi} onChange={e => setProfileUpi(e.target.value)} />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Business address</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" value={profileAddress} onChange={e => setProfileAddress(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">GST number</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" value={profileGST} onChange={e => setProfileGST(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Business Logo</span>
              <ImageUploadField value={profileLogo} onChange={setProfileLogo} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Favicon URL</span>
              <ImageUploadField value={profileFavicon} onChange={setProfileFavicon} />
            </label>
            <button type="submit" disabled={isSavingProfile}
              className="sm:col-span-2 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400">
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </form>
        </article>
      )}

      {/* ═════════════════════════════════════ TAB: POLICIES ══ */}
      {tab === "policies" && (
        <article className="mx-auto max-w-4xl rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
          <h2 className="font-heading text-xl font-bold text-slate-900">Store Policies</h2>
          <p className="mt-1 text-sm text-slate-500">
            These policy pages are shown to customers in your public store. You can keep the default text or customize it for your business.
          </p>
          <form className="mt-5 space-y-4" onSubmit={handlePoliciesSave}>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Privacy Policy</span>
              <textarea
                className="min-h-40 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                value={privacyPolicy}
                onChange={e => setPrivacyPolicy(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Return & Refund Policy</span>
              <textarea
                className="min-h-40 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                value={returnRefundPolicy}
                onChange={e => setReturnRefundPolicy(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Terms & Conditions</span>
              <textarea
                className="min-h-40 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                value={termsAndConditions}
                onChange={e => setTermsAndConditions(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={isSavingPolicies}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400"
            >
              {isSavingPolicies ? "Saving..." : "Save Policies"}
            </button>
          </form>
        </article>
      )}
    </main>
  );
}
