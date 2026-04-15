import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Order, OrderStatus, Product, SocialLink, Banner } from "../types";

type Tab = "dashboard" | "store" | "products" | "orders" | "reports" | "profile";

type ProductForm = {
  title: string; description: string; price: string; mrp: string;
  imageUrl: string; notes: string; category: string;
  variants: { label: string; options: string }[];
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

export function DashboardPage() {
  const { seller, logout, updateProfile, refreshProfile } = useAuth();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── Product form
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  // ── Profile form
  const [profileName, setProfileName] = useState(seller?.businessName || "");
  const [profileEmail, setProfileEmail] = useState(seller?.businessEmail || "");
  const [profileUpi, setProfileUpi] = useState(seller?.upiId || "");
  const [profileAddress, setProfileAddress] = useState(seller?.businessAddress || "");
  const [profileGST, setProfileGST] = useState(seller?.businessGST || "");
  const [profileLogo, setProfileLogo] = useState(seller?.businessLogo || "");
  const [profileFavicon, setProfileFavicon] = useState(seller?.favicon || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ── Store options
  const [storeLogo, setStoreLogo] = useState(seller?.businessLogo || "");
  const [storeFavicon, setStoreFavicon] = useState(seller?.favicon || "");
  const [storeWhatsapp, setStoreWhatsapp] = useState(seller?.whatsappNumber || "");
  const [storeCall, setStoreCall] = useState(seller?.callNumber || "");
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
  const [report, setReport] = useState<{ totalOrders: number; totalRevenue: number; topProducts: { title: string; unitsSold: number; revenue: number }[] } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

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
    setBanners(seller.banners || []);
    setSocialLinks(seller.socialLinks || []);
    setCategories(seller.categories || []);
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
    } catch { setError("Could not load dashboard data."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, []);

  async function loadReport() {
    setLoadingReport(true);
    try {
      const r = await api.get<{ totalOrders: number; totalRevenue: number; topProducts: { title: string; unitsSold: number; revenue: number }[] }>(`/orders/my/report?days=${reportDays}`);
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
      await updateProfile({ businessName: profileName.trim(), businessEmail: profileEmail.trim(), upiId: profileUpi.trim(), businessAddress: profileAddress.trim(), businessGST: profileGST.trim(), businessLogo: profileLogo.trim(), favicon: profileFavicon.trim() });
      setSuccess("Profile saved.");
    } catch { setError("Could not save profile."); }
    finally { setIsSavingProfile(false); }
  }

  // ── Store options save
  async function handleStoreSave() {
    setIsSavingStore(true); setError(""); setSuccess("");
    try {
      await api.put("/store/options", { businessLogo: storeLogo.trim(), favicon: storeFavicon.trim(), whatsappNumber: storeWhatsapp.trim(), callNumber: storeCall.trim(), banners, socialLinks, categories });
      await refreshProfile();
      setSuccess("Store options saved.");
    } catch { setError("Could not save store options."); }
    finally { setIsSavingStore(false); }
  }

  // ── Product create
  async function handleCreateProduct(e: FormEvent) {
    e.preventDefault(); setIsCreatingProduct(true); setError(""); setSuccess("");
    try {
      const variantPayload = productForm.variants
        .filter(v => v.label.trim())
        .map(v => ({ label: v.label.trim(), options: v.options.split(",").map(o => o.trim()).filter(Boolean) }));
      await api.post("/products", {
        title: productForm.title.trim(), description: productForm.description.trim(),
        price: Number(productForm.price), mrp: Number(productForm.mrp) || 0,
        imageUrl: productForm.imageUrl.trim(), notes: productForm.notes.trim(),
        category: productForm.category.trim(), variants: variantPayload,
      });
      if (productForm.category.trim() && !categories.includes(productForm.category.trim())) {
        setCategories(prev => [...prev, productForm.category.trim()]);
      }
      setProductForm(emptyProductForm);
      setSuccess("Product added.");
      await loadData();
    } catch { setError("Could not create product."); }
    finally { setIsCreatingProduct(false); }
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
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Seller Dashboard</p>
            <h1 className="font-heading text-xl font-bold text-slate-900 sm:text-2xl">{seller?.businessName || "Vendor Workspace"}</h1>
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: DASHBOARD                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          {/* Quick stats */}
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
          {/* Revenue cards */}
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
          {/* Store link */}
          <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Your Public Store Link</p>
            <a href={storeUrl || "#"} target="_blank" rel="noreferrer"
              className={`mt-1 block break-all text-sm ${storeUrl ? "font-semibold text-teal-700 underline-offset-2 hover:underline" : "text-slate-400"}`}>
              {storeUrl || "Store link will appear once profile is complete"}
            </a>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: STORE OPTIONS                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === "store" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Branding */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-4">
            <h2 className="font-heading text-xl font-bold text-slate-900">Branding</h2>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Business Logo URL</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="https://..." value={storeLogo} onChange={e => setStoreLogo(e.target.value)} />
            </label>
            {storeLogo && <img src={storeLogo} alt="logo preview" className="h-16 w-16 rounded-xl object-contain border border-slate-200" />}
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Favicon URL</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="https://..." value={storeFavicon} onChange={e => setStoreFavicon(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">WhatsApp Number</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeWhatsapp} onChange={e => setStoreWhatsapp(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Call Number</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeCall} onChange={e => setStoreCall(e.target.value)} />
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
              <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" placeholder="Banner Image URL" value={newBannerUrl} onChange={e => setNewBannerUrl(e.target.value)} />
              <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" placeholder="Banner title (optional)" value={newBannerTitle} onChange={e => setNewBannerTitle(e.target.value)} />
              <button onClick={() => { if (newBannerUrl.trim()) { setBanners(prev => [...prev, { imageUrl: newBannerUrl.trim(), title: newBannerTitle.trim() }]); setNewBannerUrl(""); setNewBannerTitle(""); } }}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition">+ Add Banner</button>
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
              <button onClick={() => { if (newSocialUrl.trim()) { setSocialLinks(prev => [...prev, { platform: newSocialPlatform, url: newSocialUrl.trim() }]); setNewSocialUrl(""); } }}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition">Add</button>
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
              <button onClick={() => { const c = newCategory.trim(); if (c && !categories.includes(c)) { setCategories(prev => [...prev, c]); setNewCategory(""); } }}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition">Add</button>
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: PRODUCTS                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === "products" && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Add product form */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card lg:col-span-3">
            <h2 className="font-heading text-xl font-bold text-slate-900">Add New Product</h2>
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleCreateProduct}>
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
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Image URL</span>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="https://..." value={productForm.imageUrl}
                  onChange={e => setProductForm(p => ({ ...p, imageUrl: e.target.value }))} />
              </label>
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
                  <div key={i} className="flex gap-2">
                    <input className="w-28 rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none" placeholder="Size" value={v.label}
                      onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], label: e.target.value }; return { ...p, variants: vv }; })} />
                    <input className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none" placeholder="S, M, L, XL"
                      value={v.options}
                      onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], options: e.target.value }; return { ...p, variants: vv }; })} />
                    <button type="button" onClick={() => setProductForm(p => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }))}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 text-rose-600 text-sm">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setProductForm(p => ({ ...p, variants: [...p.variants, { label: "", options: "" }] }))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition">+ Add Variant</button>
              </div>

              <button type="submit" disabled={isCreatingProduct}
                className="sm:col-span-2 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:bg-teal-300">
                {isCreatingProduct ? "Adding..." : "Add Product"}
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
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: ORDERS                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === "orders" && (
        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
          <h2 className="font-heading text-xl font-bold text-slate-900">Incoming Orders</h2>
          {loading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
          {!loading && orders.length === 0 && <p className="mt-4 text-sm text-slate-500">No orders yet.</p>}
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
                    {["pending","paid","confirmed","cancelled"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </article>
              ))}
            </div>
          )}
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
                      <td className="py-3 pr-4 text-xs text-slate-500">{order.selectedVariants ? Object.entries(order.selectedVariants).map(([k,v]) => `${k}: ${v}`).join(", ") : "—"}</td>
                      <td className="py-3 pr-4 text-slate-700">{order.quantity}</td>
                      <td className="py-3 pr-4 text-slate-700">₹{order.amount}</td>
                      <td className="py-3 pr-4 text-slate-700">₹{order.deliveryCharge || 0}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">₹{order.amount + (order.deliveryCharge || 0)}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[order.paymentStatus]}`}>{order.paymentStatus}</span></td>
                      <td className="py-3 pr-4">{order.paymentScreenshotUrl ? <a href={order.paymentScreenshotUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-700 underline">View</a> : <span className="text-xs text-slate-400">None</span>}</td>
                      <td className="py-3">
                        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none" value={order.paymentStatus} onChange={e => handleOrderStatus(order._id, e.target.value as OrderStatus)}>
                          {["pending","paid","confirmed","cancelled"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: REPORTS                                            */}
      {/* ═══════════════════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: PROFILE                                            */}
      {/* ═══════════════════════════════════════════════════════ */}
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
              <span className="text-sm font-semibold text-slate-700">Business Logo URL</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="https://..." value={profileLogo} onChange={e => setProfileLogo(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Favicon URL</span>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="https://..." value={profileFavicon} onChange={e => setProfileFavicon(e.target.value)} />
            </label>
            <button type="submit" disabled={isSavingProfile}
              className="sm:col-span-2 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400">
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </form>
        </article>
      )}
    </main>
  );
}
