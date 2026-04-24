import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { DEFAULT_POLICY_CONTENT } from "../constants/policyDefaults";
import {
  DEFAULT_COUNTRY_CODE,
  formatAddress,
  formatPhone,
  parseAddress,
  parsePhone,
  type AddressParts,
  type PhoneParts,
} from "../utils/contactFields";
import type { Order, OrderStatus, Product, SocialLink, Banner, PaymentMode } from "../types";

type Tab = "dashboard" | "store" | "products" | "orders" | "reports" | "profile" | "policies";
type ProductFormVariant = {
  label: string;   // value / size  e.g. "500"
  uom: string;     // unit of measure e.g. "g", "ml", "Pack"
  amount: string;  // price
};

type ProductForm = {
  title: string; description: string; price: string; mrp: string;
  imageUrls: string[]; notes: string; category: string;
  variants: ProductFormVariant[];
};
const emptyProductForm: ProductForm = {
  title: "", description: "", price: "", mrp: "",
  imageUrls: [""], notes: "", category: "", variants: [],
};

const statusClasses: Record<OrderStatus, string> = {
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  paid:      "bg-sky-100 text-sky-700 border-sky-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};
const STATUS_DOT: Record<OrderStatus, string> = {
  pending:   "bg-amber-400",
  paid:      "bg-sky-500",
  delivered: "bg-emerald-500",
  cancelled: "bg-rose-500",
};
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending:   "Pending",
  paid:      "Paid",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const ORDER_STATUSES: OrderStatus[] = ["pending", "paid", "delivered", "cancelled"];

const SOCIAL_PLATFORMS = ["Instagram", "Facebook", "Twitter/X", "YouTube", "LinkedIn", "Website", "Google Location", "Other"];

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

function normalizeImageUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getProductImages(product: Product): string[] {
  const list = Array.isArray(product.imageUrls) ? product.imageUrls : [];
  const cleaned = list.map(normalizeImageUrl).filter(Boolean);
  if (cleaned.length > 0) return cleaned;
  const fallback = normalizeImageUrl(product.imageUrl || "");
  return fallback ? [fallback] : [];
}

// ─── DashboardPage ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { seller, logout, updateProfile, refreshProfile } = useAuth();
  const { t } = useI18n();

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
  const [profileAddress, setProfileAddress] = useState<AddressParts>(parseAddress(seller?.businessAddress || ""));
  const [profileGST, setProfileGST] = useState(seller?.businessGST || "");
  const [profileLogo, setProfileLogo] = useState(seller?.businessLogo || "");
  const [profileFavicon, setProfileFavicon] = useState(seller?.favicon || "");
  const [profileCategory, setProfileCategory] = useState(seller?.businessCategory || "");
  const [profileIdProof, setProfileIdProof] = useState(seller?.idProofUrl || "");
  const [profileAddressProof, setProfileAddressProof] = useState(seller?.addressProofUrl || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [privacyPolicy, setPrivacyPolicy] = useState<string>(DEFAULT_POLICY_CONTENT.privacyPolicy);
  const [returnRefundPolicy, setReturnRefundPolicy] = useState<string>(DEFAULT_POLICY_CONTENT.returnRefundPolicy);
  const [termsAndConditions, setTermsAndConditions] = useState<string>(DEFAULT_POLICY_CONTENT.termsAndConditions);
  const [isSavingPolicies, setIsSavingPolicies] = useState(false);

  // ── Store options
  const [storeLogo, setStoreLogo] = useState(seller?.businessLogo || "");
  const [storeFavicon, setStoreFavicon] = useState(seller?.favicon || "");
  const [storeWhatsapp, setStoreWhatsapp] = useState<PhoneParts>(parsePhone(seller?.whatsappNumber || ""));
  const [storeCall, setStoreCall] = useState<PhoneParts>(parsePhone(seller?.callNumber || ""));
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
  const [, forceTickUpdate] = useState(0);

  // ── Order search / filter / modal
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatus | "">("");
  const [orderCategoryFilter, setOrderCategoryFilter] = useState("");
  const [showOrderFilter, setShowOrderFilter] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  const [copyFeedback, setCopyFeedback] = useState("");
  const [showStoreQrActions, setShowStoreQrActions] = useState(false);
  const storeQrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync seller into local form state
  useEffect(() => {
    if (!seller) return;
    setProfileName(seller.businessName || "");
    setProfileEmail(seller.businessEmail || "");
    setProfileUpi(seller.upiId || "");
    setProfileAddress(parseAddress(seller.businessAddress || ""));
    setProfileGST(seller.businessGST || "");
    setProfileLogo(seller.businessLogo || "");
    setProfileFavicon(seller.favicon || "");
    setProfileCategory(seller.businessCategory || "");
    setProfileIdProof(seller.idProofUrl || "");
    setProfileAddressProof(seller.addressProofUrl || "");
    setStoreLogo(seller.businessLogo || "");
    setStoreFavicon(seller.favicon || "");
    setStoreWhatsapp(parsePhone(seller.whatsappNumber || ""));
    setStoreCall(parsePhone(seller.callNumber || ""));
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
      activeProducts: products.filter(p => p.isActive).length,
      inactiveProducts: products.filter(p => !p.isActive).length,
      totalOrders: orders.length,
      pending: orders.filter(o => o.paymentStatus === "pending").length,
      delivered: orders.filter(o => o.paymentStatus === "delivered").length,
      value7d: recent7.reduce((s, o) => s + o.amount + (o.deliveryCharge || 0), 0),
      value30d: recent30.reduce((s, o) => s + o.amount + (o.deliveryCharge || 0), 0),
    };
  }, [orders, products]);

  const storeUrl = useMemo(() => {
    if (!seller?.slug) return "";
    return `${window.location.origin}/store/${seller.slug}`;
  }, [seller?.slug]);

  async function copyStoreLink() {
    if (!storeUrl) return;
    await navigator.clipboard.writeText(storeUrl);
    setCopyFeedback("Store link copied!"); window.setTimeout(() => setCopyFeedback(""), 2000);
  }

  async function shareStoreLink() {
    if (!storeUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: seller?.businessName || "Store",
          text: `Check out ${seller?.businessName || "this store"}`,
          url: storeUrl,
        });
        return;
      } catch {
        // Fallback to copy link.
      }
    }
    await navigator.clipboard.writeText(storeUrl);
    setCopyFeedback("Store link copied!");
    window.setTimeout(() => setCopyFeedback(""), 2000);
  }

  function downloadStoreQrCode() {
    const canvas = storeQrCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${seller?.slug || "store"}-qr.png`;
    link.click();
  }

  // ── Profile save
  async function handleProfileSave(e: FormEvent) {
    e.preventDefault(); setIsSavingProfile(true); setError(""); setSuccess("");
    try {
      await updateProfile({
        businessName: profileName.trim(),
        businessEmail: profileEmail.trim(),
        upiId: profileUpi.trim(),
        businessAddress: formatAddress(profileAddress),
        businessGST: profileGST.trim(),
        businessLogo: profileLogo.trim(),
        favicon: profileFavicon.trim(),
        businessCategory: profileCategory.trim(),
        idProofUrl: profileIdProof.trim(),
        addressProofUrl: profileAddressProof.trim(),
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
        whatsappNumber: formatPhone(storeWhatsapp),
        callNumber: formatPhone(storeCall),
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

  // ── Product catalog search + filter state
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // ── Category autocomplete state
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── Product: start edit
  function handleStartEdit(prod: Product) {
    setEditingProduct(prod);
    const variantRows: ProductFormVariant[] = [];
    const grouped = new Set<string>();
    (prod.variants || []).forEach((variant) => {
      (variant.options || []).forEach((option) => {
        if (!option || grouped.has(option)) return;
        grouped.add(option);
        const key = getVariantPriceKey(variant.label, option);
        const fallbackKey = getVariantPriceKey("Variant", option);
        const rawPrice = prod.variantPrices?.[key] ?? prod.variantPrices?.[fallbackKey];
        // Try to parse "value uom" from option string e.g. "500g" or "500 g"
        const match = option.match(/^([\d.]+)\s*([a-zA-Z]*)$/);
        variantRows.push({
          label: match ? match[1] : option,
          uom: match ? match[2] : "",
          amount: rawPrice !== undefined && rawPrice !== null ? String(rawPrice) : "",
        });
      });
    });
    setProductForm({
      title: prod.title,
      description: prod.description || "",
      price: String(prod.price),
      mrp: String(prod.mrp || ""),
      imageUrls: getProductImages(prod).length > 0 ? getProductImages(prod) : [""],
      notes: prod.notes || "",
      category: prod.category || "",
      variants: variantRows,
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
      // Build option string as "value uom" e.g. "500g" or just "500"
      const variantPayload = productForm.variants
        .filter(v => v.label.trim() && Number(v.amount) > 0)
        .map(v => ({
          label: "Variant",
          option: (v.label.trim() + (v.uom.trim() ? v.uom.trim() : "")),
          amount: Number(v.amount),
        }));

      const hasVariants = variantPayload.length > 0;
      const baseSellingPrice = Number(productForm.price);
      const baseMrp = Number(productForm.mrp);
      const variantPrices = variantPayload.reduce<Record<string, number>>((acc, variant) => {
        acc[getVariantPriceKey(variant.label, variant.option)] = variant.amount;
        return acc;
      }, {});
      const variantMrps = {};

      if (!hasVariants && (!Number.isFinite(baseSellingPrice) || baseSellingPrice <= 0)) {
        setError("Enter product selling price, or add variants with prices.");
        setIsSubmittingProduct(false);
        return;
      }

      if (Number.isFinite(baseMrp) && baseMrp > 0 && Number.isFinite(baseSellingPrice) && baseSellingPrice > 0 && baseSellingPrice >= baseMrp) {
        setError("Product selling price should be less than product MRP.");
        setIsSubmittingProduct(false);
        return;
      }
      const normalizedImages = productForm.imageUrls
        .map(normalizeImageUrl)
        .filter(Boolean);
      if (normalizedImages.length === 0) {
        setError("At least 1 product image is required.");
        setIsSubmittingProduct(false);
        return;
      }

      const catTrimmed = productForm.category.trim();
      const payload = {
        title: productForm.title.trim(),
        description: productForm.description.trim(),
        price: Number.isFinite(baseSellingPrice) ? baseSellingPrice : 0,
        mrp: Number(productForm.mrp) || 0,
        imageUrl: normalizedImages[0],
        imageUrls: normalizedImages,
        notes: productForm.notes.trim(),
        category: catTrimmed,
        variants: hasVariants ? [{ label: "Variant", options: variantPayload.map(v => v.option) }] : [],
        variantPrices,
        variantMrps,
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct._id}`, payload);
        setSuccess("Product updated.");
        setEditingProduct(null);
      } else {
        await api.post("/products", payload);
        if (catTrimmed && !categories.includes(catTrimmed)) {
          const updated = [...categories, catTrimmed];
          setCategories(updated);
          // also persist the new category
          await api.put("/store/options", {
            businessLogo: storeLogo.trim(), favicon: storeFavicon.trim(),
            whatsappNumber: formatPhone(storeWhatsapp), callNumber: formatPhone(storeCall),
            banners, socialLinks, categories: updated,
            deliveryMode: storeDeliveryMode,
            defaultDeliveryCharge: Math.max(0, Number(storeDeliveryCharge) || 0),
            freeDeliveryThreshold: Math.max(0, Number(storeFreeDeliveryThreshold) || 0),
            paymentMode: storePaymentMode,
          });
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
    { key: "dashboard", label: `📊 ${t("nav.dashboard", "Dashboard")}` },
    { key: "store", label: `🏪 ${t("nav.store", "Store Options")}` },
    { key: "products", label: `📦 ${t("nav.products", "Products")}` },
    { key: "orders", label: `🧾 ${t("nav.orders", "Orders")}` },
    { key: "reports", label: `📈 ${t("nav.reports", "Reports")}` },
    { key: "profile", label: `👤 ${t("nav.profile", "Profile")}` },
    { key: "policies", label: `📄 ${t("nav.policies", "Policies")}` },
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
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button
            onClick={copyStoreLink}
            disabled={!storeUrl}
            aria-label="Copy public store link"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 transition sm:flex-none"
          >
            {copyFeedback ? "✅ Copied" : "🔗 Copy Store Link"}
          </button>
          {storeUrl && (
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open public store in new tab"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition sm:flex-none"
            >
              🌐 Open Store
            </a>
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
          {/* Row 1 — 6 stat cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Total Products",    value: stats.totalProducts,    color: "text-slate-900",    icon: "📦" },
              { label: "Active Products",   value: stats.activeProducts,   color: "text-emerald-600",  icon: "🟢" },
              { label: "Inactive Products", value: stats.inactiveProducts, color: "text-rose-500",     icon: "🔴" },
              { label: "Total Orders",      value: stats.totalOrders,      color: "text-slate-900",    icon: "🛒" },
              { label: "Pending",           value: stats.pending,          color: "text-amber-600",    icon: "⏳" },
              { label: "Delivered",         value: stats.delivered,        color: "text-teal-600",     icon: "✅" },
            ].map(s => (
              <article key={s.label} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{s.label}</p>
                  <span className="text-base">{s.icon}</span>
                </div>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </article>
            ))}
          </div>

          {/* Row 2 — Revenue cards */}
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

          {/* Row 3 — QR card */}
          {storeUrl && (
            <article className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                {/* QR */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowStoreQrActions(v => !v)}
                    className="block rounded-xl border-2 border-slate-200 p-1 hover:border-teal-400 transition"
                    title="Click for share / download options"
                  >
                    <QRCodeCanvas
                      value={storeUrl}
                      size={100}
                      ref={storeQrCanvasRef}
                      includeMargin
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                    />
                  </button>
                  {showStoreQrActions && (
                    <div className="absolute left-0 top-full z-20 mt-2 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      <button type="button" onClick={() => void shareStoreLink()} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">📤 Share</button>
                      <button type="button" onClick={downloadStoreQrCode} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">⬇ Download PNG</button>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Your Store QR Code</p>
                  <p className="text-sm font-semibold text-teal-700 break-all mb-3">{storeUrl}</p>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => void shareStoreLink()}
                      className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 transition"
                    >📤 Share Store</button>
                    <button
                      type="button"
                      onClick={downloadStoreQrCode}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >⬇ Download QR</button>
                    <button
                      type="button"
                      onClick={() => void copyStoreLink()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >🔗 Copy Link</button>
                  </div>
                </div>
              </div>
            </article>
          )}
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
            {storeLogo && <img src={normalizeImageUrl(storeLogo)} alt="logo preview" className="h-16 w-16 rounded-xl object-contain border border-slate-200" />}
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Favicon URL</span>
              <ImageUploadField value={storeFavicon} onChange={setStoreFavicon} placeholder="https://..." />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">WhatsApp Number</span>
              <div className="flex gap-2">
                <input className="w-24 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="+91" value={storeWhatsapp.countryCode} onChange={e => setStoreWhatsapp((prev) => ({ ...prev, countryCode: e.target.value || DEFAULT_COUNTRY_CODE }))} />
                <input className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeWhatsapp.number} onChange={e => setStoreWhatsapp((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Call Number</span>
              <div className="flex gap-2">
                <input className="w-24 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="+91" value={storeCall.countryCode} onChange={e => setStoreCall((prev) => ({ ...prev, countryCode: e.target.value || DEFAULT_COUNTRY_CODE }))} />
                <input className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeCall.number} onChange={e => setStoreCall((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
              </div>
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
                <option value="prepaid_only">UPI / Prepaid</option>
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

            {/* Social Links — inside Branding & Contact */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Social & Online Links</p>
              {socialLinks.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
                  <span className="font-semibold text-slate-700 w-24 shrink-0">{s.platform}</span>
                  <span className="flex-1 text-slate-500 truncate">{s.url}</span>
                  <button onClick={() => setSocialLinks(prev => prev.filter((_, j) => j !== i))} className="text-rose-600 text-xs font-semibold px-2 py-1 rounded-lg border border-rose-200 bg-rose-50">✕</button>
                </div>
              ))}
              <div className="flex gap-2">
                <select className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none bg-white" value={newSocialPlatform} onChange={e => setNewSocialPlatform(e.target.value)}>
                  {SOCIAL_PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
                <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="https://..." value={newSocialUrl} onChange={e => setNewSocialUrl(e.target.value)} />
                <button
                  onClick={() => { if (newSocialUrl.trim()) { setSocialLinks(prev => [...prev, { platform: newSocialPlatform, url: newSocialUrl.trim() }]); setNewSocialUrl(""); } }}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
                >Add</button>
              </div>
            </div>
          </article>

          {/* Banners — max 5 */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-slate-900">Store Banners</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-bold border ${
                banners.length >= 5
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}>{banners.length}/5</span>
            </div>
            <p className="text-xs text-slate-500">Upload up to 5 banner images. They appear as an auto-carousel on your public store.</p>
            <div className="space-y-2">
              {banners.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {b.imageUrl && <img src={normalizeImageUrl(b.imageUrl)} alt="" className="h-12 w-20 rounded-lg object-cover" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{b.title || `Banner ${i + 1}`}</p>
                    <p className="text-xs text-slate-400 truncate">{b.imageUrl}</p>
                  </div>
                  <button onClick={() => setBanners(prev => prev.filter((_, j) => j !== i))} className="text-rose-600 text-xs font-semibold px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 shrink-0">Remove</button>
                </div>
              ))}
            </div>
            {banners.length < 5 ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Banner Image</span>
                  <ImageUploadField value={newBannerUrl} onChange={setNewBannerUrl} placeholder="Banner Image URL" />
                </label>
                <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" placeholder="Banner title (optional)" value={newBannerTitle} onChange={e => setNewBannerTitle(e.target.value)} />
                <button
                  onClick={() => {
                    if (newBannerUrl.trim() && banners.length < 5) {
                      setBanners(prev => [...prev, { imageUrl: newBannerUrl.trim(), title: newBannerTitle.trim() }]);
                      setNewBannerUrl(""); setNewBannerTitle("");
                    }
                  }}
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
                >+ Add Banner</button>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-semibold text-center">
                🚫 Maximum 5 banners reached. Remove one to add another.
              </div>
            )}
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
        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          {/* Add / Edit product form */}
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
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
            <form className="mt-4 space-y-4" onSubmit={handleSubmitProduct}>

              {/* ── Section 1: Title + Category */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Product Title *</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="Home-made Ragi Laddu"
                    value={productForm.title}
                    onChange={e => setProductForm(p => ({ ...p, title: e.target.value }))}
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Category</span>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                      placeholder="Type or select a category…"
                      value={productForm.category}
                      autoComplete="off"
                      onChange={e => {
                        const val = e.target.value;
                        setProductForm(p => ({ ...p, category: val }));
                        const q = val.trim().toLowerCase();
                        setCategorySuggestions(
                          q ? categories.filter(c => c.toLowerCase().includes(q)) : categories
                        );
                        setShowSuggestions(true);
                      }}
                      onFocus={() => {
                        setCategorySuggestions(
                          productForm.category.trim()
                            ? categories.filter(c => c.toLowerCase().includes(productForm.category.toLowerCase()))
                            : categories
                        );
                        setShowSuggestions(true);
                      }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    />
                    {showSuggestions && (categorySuggestions.length > 0 || (productForm.category.trim() && !categories.includes(productForm.category.trim()))) && (
                      <ul className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                        {categorySuggestions.map(c => (
                          <li
                            key={c}
                            onMouseDown={() => {
                              setProductForm(p => ({ ...p, category: c }));
                              setShowSuggestions(false);
                            }}
                            className="cursor-pointer px-4 py-2 text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition"
                          >{c}</li>
                        ))}
                        {productForm.category.trim() && !categories.includes(productForm.category.trim()) && (
                          <li
                            onMouseDown={() => {
                              const c = productForm.category.trim();
                              setCategories(prev => prev.includes(c) ? prev : [...prev, c]);
                              setShowSuggestions(false);
                            }}
                            className="cursor-pointer px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border-t border-slate-100 hover:bg-teal-100 transition"
                          >➕ Create "{productForm.category.trim()}"</li>
                        )}
                      </ul>
                    )}
                  </div>
                </label>

                {/* Quick-add new category inline */}
                <div className="flex gap-2 items-center pt-1">
                  <input
                    id="quick-new-category"
                    className="flex-1 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-400 placeholder:text-slate-400"
                    placeholder="+ Add new category…"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const c = newCategory.trim();
                        if (c && !categories.includes(c)) { setCategories(prev => [...prev, c]); }
                        if (c) { setProductForm(p => ({ ...p, category: c })); }
                        setNewCategory("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const c = newCategory.trim();
                      if (c && !categories.includes(c)) { setCategories(prev => [...prev, c]); }
                      if (c) { setProductForm(p => ({ ...p, category: c })); }
                      setNewCategory("");
                    }}
                    className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition whitespace-nowrap"
                  >Add</button>
                </div>
              </div>

              {/* ── Section 2: Images + Description + Notes */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-700">Product Images *</span>
                    <button
                      type="button"
                      onClick={() => setProductForm(p => ({ ...p, imageUrls: [...p.imageUrls, ""] }))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >+ Add image</button>
                  </div>
                  <div className="space-y-2">
                    {productForm.imageUrls.map((url, index) => (
                      <div key={index} className="rounded-xl border border-slate-200 bg-white p-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <div className="flex-1">
                            <ImageUploadField
                              value={url}
                              onChange={(nextUrl) => setProductForm((p) => {
                                const next = [...p.imageUrls];
                                next[index] = nextUrl;
                                return { ...p, imageUrls: next };
                              })}
                              placeholder="https://..."
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setProductForm((p) => ({
                              ...p,
                              imageUrls: p.imageUrls.length > 1 ? p.imageUrls.filter((_, i) => i !== index) : [""],
                            }))}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                          >Remove</button>
                        </div>
                        {normalizeImageUrl(url) && (
                          <img src={normalizeImageUrl(url)} alt={`preview-${index + 1}`} className="mt-2 h-24 w-24 rounded-xl object-cover border border-slate-200" />
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-slate-500">Add at least one image. First image is used as default thumbnail.</p>
                  </div>
                </div>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Description</span>
                  <textarea
                    className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="What does the customer get?"
                    value={productForm.description}
                    onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Additional Info (Notes)</span>
                  <textarea
                    className="min-h-14 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="Delivery info, pickup details..."
                    value={productForm.notes}
                    onChange={e => setProductForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </label>
              </div>

              {/* ── Section 3: Selling Price + MRP */}
              <div className="grid gap-3 sm:grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Selling Price (₹)</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="499"
                    value={productForm.price}
                    onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))}
                  />
                  <p className="text-xs text-slate-500">Leave empty if pricing only through variants.</p>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">MRP (₹)</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="599"
                    value={productForm.mrp}
                    onChange={e => setProductForm(p => ({ ...p, mrp: e.target.value }))}
                  />
                  <p className="text-xs text-slate-500">MRP should be greater than selling price.</p>
                </label>
              </div>

              {/* ── Section 4: Variants */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Product Variants &amp; Pricing</p>
                  <p className="text-xs text-slate-500 mt-0.5">Each variant has a value, unit of measure (UOM) and price.</p>
                </div>
                {productForm.variants.length > 0 && (
                  <div className="grid grid-cols-[1fr_80px_100px_32px] gap-1.5 px-1">
                    <span className="text-xs font-semibold text-slate-500">Value</span>
                    <span className="text-xs font-semibold text-slate-500">UOM</span>
                    <span className="text-xs font-semibold text-slate-500">Price (₹)</span>
                    <span />
                  </div>
                )}
                {productForm.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-1.5 items-center">
                    <input
                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="e.g. 500"
                      value={v.label}
                      onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], label: e.target.value }; return { ...p, variants: vv }; })}
                    />
                    <input
                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="g / ml"
                      value={v.uom}
                      onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], uom: e.target.value }; return { ...p, variants: vv }; })}
                    />
                    <input
                      type="number" min={0}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="499"
                      value={v.amount}
                      onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], amount: e.target.value }; return { ...p, variants: vv }; })}
                    />
                    <button
                      type="button"
                      onClick={() => setProductForm(p => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-sm hover:bg-rose-100 transition"
                    >✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setProductForm(p => ({ ...p, variants: [...p.variants, { label: "", uom: "", amount: "" }] }))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
                >+ Add Variant</button>
              </div>

              <div className="flex flex-wrap justify-between gap-2 pt-1">
                <button type="submit" disabled={isSubmittingProduct}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${editingProduct ? "bg-amber-600 hover:bg-amber-500" : "bg-teal-600 hover:bg-teal-500"}`}>
                  {isSubmittingProduct
                    ? (editingProduct ? "Saving…" : "Saving...")
                    : editingProduct ? "💾 Update Product" : "➕ Add Product"}
                </button>
              </div>
            </form>
          </article>

          {/* Product catalog */}
          <div className="h-full">
          <article className="h-full flex flex-col rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
            {/* Catalog header + search */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-heading text-xl font-bold text-slate-900">Product Catalog</h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">{products.length}</span>
            </div>
            {/* Search bar with filter icon */}
            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-400 text-sm">🔍</span>
                <input
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  placeholder="Search products…"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                />
                {catalogCategory && (
                  <button
                    type="button"
                    onClick={() => { setCatalogCategory(""); setShowFilterDropdown(false); }}
                    className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition"
                  >
                    <span className="max-w-[80px] truncate">{catalogCategory}</span>
                    <span>✕</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(v => !v)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                    catalogCategory
                      ? "border-teal-300 bg-teal-100 text-teal-700"
                      : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600"
                  }`}
                  title="Filter by category"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              {/* Filter dropdown */}
              {showFilterDropdown && categories.length > 0 && (
                <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                  <p className="px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Filter by Category</p>
                  <ul className="max-h-52 overflow-y-auto py-1">
                    {categories.map(c => (
                      <li key={c}>
                        <button
                          type="button"
                          onClick={() => { setCatalogCategory(prev => prev === c ? "" : c); setShowFilterDropdown(false); }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition ${
                            catalogCategory === c
                              ? "bg-teal-50 font-semibold text-teal-800"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className={`h-3.5 w-3.5 rounded-full border flex-shrink-0 ${
                            catalogCategory === c ? "border-teal-500 bg-teal-500" : "border-slate-300"
                          }`} />
                          {c}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {catalogCategory && (
                    <div className="border-t border-slate-100 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => { setCatalogCategory(""); setShowFilterDropdown(false); }}
                        className="w-full rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                      >Clear filter</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {loading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
            {!loading && products.length === 0 && <p className="mt-4 text-sm text-slate-500">No products yet.</p>}
            <div className="mt-3 flex-1 overflow-y-auto space-y-3 pr-1">
              {products
                .filter(prod => {
                  const q = catalogSearch.trim().toLowerCase();
                  const matchSearch = !q || prod.title.toLowerCase().includes(q) || (prod.category || "").toLowerCase().includes(q);
                  const matchCat = !catalogCategory || prod.category === catalogCategory;
                  return matchSearch && matchCat;
                })
                .map(prod => (
                <div key={prod._id} className={`rounded-2xl border p-3 ${prod.isActive ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-100 opacity-60"}`}>
                  <div className="flex items-start gap-2">
                    {getProductImages(prod)[0] && <img src={getProductImages(prod)[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{prod.title}</p>
                      {prod.category && (
                        <span className="inline-block mt-0.5 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{prod.category}</span>
                      )}
                      <div className="flex gap-2 mt-1">
                        <span className="text-sm font-bold text-slate-900">₹{prod.price}</span>
                        {prod.mrp > 0 && prod.mrp > prod.price && (
                          <span className="text-xs text-slate-400 line-through self-center">₹{prod.mrp}</span>
                        )}
                      </div>
                      {prod.variants.some(v => v.options.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prod.variants.flatMap(variant =>
                            variant.options.map(option => {
                              const variantPrice = prod.variantPrices?.[getVariantPriceKey(variant.label, option)];
                              return (
                                <span key={option} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                                  {option}{variantPrice ? ` · ₹${variantPrice}` : ""}
                                </span>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleStartEdit(prod)}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition"
                    >✏️ Edit</button>
                    <button onClick={() => handleToggleProduct(prod._id)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${prod.isActive ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"}`}>
                      {prod.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDeleteProduct(prod._id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">Delete</button>
                  </div>
                </div>
              ))}
              {!loading && products.filter(p => {
                const q = catalogSearch.trim().toLowerCase();
                return (!q || p.title.toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q)) && (!catalogCategory || p.category === catalogCategory);
              }).length === 0 && products.length > 0 && (
                <p className="py-4 text-center text-sm text-slate-400">No products match your search / filter.</p>
              )}
            </div>
          </article>

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ TAB: ORDERS ══ */}
      {tab === "orders" && (
        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-bold text-slate-900">Orders</h2>
            <div className="flex items-center gap-3">
              {ordersLastUpdated && (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live · {timeAgo(ordersLastUpdated)}
                </span>
              )}
              <button onClick={() => void loadData()} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">↻ Refresh</button>
            </div>
          </div>

          {/* Search + filter bar */}
          <div className="relative mt-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-400 text-sm">🔍</span>
              <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search by customer, product or category…" value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />
              {(orderStatusFilter || orderCategoryFilter) && (
                <button type="button" onClick={() => { setOrderStatusFilter(""); setOrderCategoryFilter(""); }}
                  className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition">
                  {[orderStatusFilter && STATUS_LABEL[orderStatusFilter as OrderStatus], orderCategoryFilter].filter(Boolean).join(" · ")} <span>✕</span>
                </button>
              )}
              <button type="button" onClick={() => setShowOrderFilter(v => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${ (orderStatusFilter || orderCategoryFilter) ? "border-teal-300 bg-teal-100 text-teal-700" : "border-slate-200 bg-white text-slate-400 hover:text-slate-600"}`}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </button>
            </div>
            {showOrderFilter && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                <p className="px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Status</p>
                <ul className="py-1 border-b border-slate-100">
                  {ORDER_STATUSES.map(s => (
                    <li key={s}><button type="button" onClick={() => { setOrderStatusFilter(prev => prev === s ? "" : s); setShowOrderFilter(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition ${orderStatusFilter === s ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s]}`} />{STATUS_LABEL[s]}
                    </button></li>
                  ))}
                </ul>
                {categories.length > 0 && (
                  <><p className="px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Category</p>
                  <ul className="py-1 max-h-40 overflow-y-auto">
                    {categories.map(c => (
                      <li key={c}><button type="button" onClick={() => { setOrderCategoryFilter(prev => prev === c ? "" : c); setShowOrderFilter(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition ${orderCategoryFilter === c ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}>
                        <span className={`h-3 w-3 rounded-full border flex-shrink-0 ${orderCategoryFilter === c ? "border-teal-500 bg-teal-500" : "border-slate-300"}`} />{c}
                      </button></li>
                    ))}
                  </ul></>
                )}
                {(orderStatusFilter || orderCategoryFilter) && (
                  <div className="border-t border-slate-100 px-2 py-1.5">
                    <button type="button" onClick={() => { setOrderStatusFilter(""); setOrderCategoryFilter(""); setShowOrderFilter(false); }}
                      className="w-full rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition">Clear filters</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {loading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
          {!loading && orders.length === 0 && <p className="mt-4 text-sm text-slate-500">No orders yet.</p>}

          {orders.length > 0 && (() => {
            const filtered = orders.filter(o => {
              const q = orderSearch.trim().toLowerCase();
              const matchQ = !q || o.customerName.toLowerCase().includes(q) || o.customerPhone.includes(q) || (o.product?.title||"").toLowerCase().includes(q) || (o.product?.category||"").toLowerCase().includes(q);
              const matchS = !orderStatusFilter || o.paymentStatus === orderStatusFilter;
              const matchC = !orderCategoryFilter || (o.product?.category||"") === orderCategoryFilter;
              return matchQ && matchS && matchC;
            });
            return (
              <>
                {/* Mobile cards */}
                <div className="mt-4 space-y-3 md:hidden">
                  {filtered.map(order => (
                    <article key={order._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">{order.customerName}</p>
                          <p className="text-xs text-slate-500">{order.customerPhone}</p>
                          {order.deliveryAddress && <p className="mt-0.5 text-xs text-slate-400">📍 {order.deliveryAddress}</p>}
                        </div>
                        <span className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[order.paymentStatus]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[order.paymentStatus]}`} />{STATUS_LABEL[order.paymentStatus]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{order.product?.title||"—"}</p>
                      <p className="text-xs text-slate-500">Qty: {order.quantity} · ₹{order.amount} + ₹{order.deliveryCharge||0} = <strong>₹{order.amount+(order.deliveryCharge||0)}</strong></p>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setViewingOrder(order)} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">👁 View</button>
                        <select className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none" value={order.paymentStatus} onChange={e => handleOrderStatus(order._id, e.target.value as OrderStatus)}>
                          {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </div>
                    </article>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block mt-4">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                      <th className="pb-2 pr-4">Customer</th><th className="pb-2 pr-4">Product</th>
                      <th className="pb-2 pr-4">Variant</th><th className="pb-2 pr-4">Qty</th>
                      <th className="pb-2 pr-4">Total</th><th className="pb-2 pr-4" title="Status">●</th>
                      <th className="pb-2 pr-4">Update</th><th className="pb-2">View</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map(order => (
                        <tr key={order._id} className="border-b border-slate-100 hover:bg-slate-50/60 transition">
                          <td className="py-3 pr-4">
                            <p className="font-semibold text-slate-800 whitespace-nowrap">{order.customerName}</p>
                            <p className="text-xs text-slate-500">{order.customerPhone}</p>
                            {order.deliveryAddress && <p className="text-xs text-slate-400 max-w-[160px] truncate" title={order.deliveryAddress}>📍 {order.deliveryAddress}</p>}
                          </td>
                          <td className="py-3 pr-4">
                            <p className="text-slate-700 whitespace-nowrap">{order.product?.title||"—"}</p>
                            {order.product?.category && <p className="text-xs text-teal-700">{order.product.category}</p>}
                          </td>
                          <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">{order.selectedVariants&&Object.keys(order.selectedVariants).length>0?Object.values(order.selectedVariants).join(", "):"—"}</td>
                          <td className="py-3 pr-4 text-slate-700">{order.quantity}</td>
                          <td className="py-3 pr-4 font-semibold text-slate-900 whitespace-nowrap">₹{order.amount+(order.deliveryCharge||0)}</td>
                          <td className="py-3 pr-4">
                            <span title={STATUS_LABEL[order.paymentStatus]} className={`inline-flex h-3 w-3 rounded-full ${STATUS_DOT[order.paymentStatus]}`} />
                          </td>
                          <td className="py-3 pr-4">
                            <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none" value={order.paymentStatus} onChange={e => handleOrderStatus(order._id, e.target.value as OrderStatus)}>
                              {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                            </select>
                          </td>
                          <td className="py-3">
                            <button onClick={() => setViewingOrder(order)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition whitespace-nowrap">👁 View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length===0&&<p className="py-6 text-center text-sm text-slate-400">No orders match your search / filter.</p>}
                </div>
              </>
            );
          })()}
        </article>
      )}

      {/* ── Order detail modal ── */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setViewingOrder(null)}>
          <div className="relative w-full max-w-lg rounded-3xl border border-white/70 bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">Order Details</h3>
                <p className="text-xs text-slate-400">#{viewingOrder._id.slice(-8).toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[viewingOrder.paymentStatus]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[viewingOrder.paymentStatus]}`} />{STATUS_LABEL[viewingOrder.paymentStatus]}
                </span>
                <button onClick={() => setViewingOrder(null)} className="rounded-xl border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 transition">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[65vh] px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Customer</p>
                  <p className="font-semibold text-slate-800">{viewingOrder.customerName}</p>
                  <p className="text-sm text-slate-600">{viewingOrder.customerPhone}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Order Date</p>
                  <p className="text-sm text-slate-700">{new Date(viewingOrder.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>
                  <p className="text-xs text-slate-400">{new Date(viewingOrder.createdAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p>
                </div>
              </div>
              {viewingOrder.deliveryAddress && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">📍 Delivery Address</p>
                  <p className="text-sm text-slate-700">{viewingOrder.deliveryAddress}</p>
                </div>
              )}
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Product</p>
                <p className="font-semibold text-slate-800">{viewingOrder.product?.title||"—"}</p>
                {viewingOrder.product?.category && <span className="inline-block mt-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{viewingOrder.product.category}</span>}
                {viewingOrder.selectedVariants&&Object.keys(viewingOrder.selectedVariants).length>0&&(
                  <p className="mt-1 text-xs text-slate-500">Variant: {Object.values(viewingOrder.selectedVariants).join(", ")}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {[{l:"Quantity",v:viewingOrder.quantity},{l:"Items Total",v:`₹${viewingOrder.amount}`},{l:"Delivery Charge",v:`₹${viewingOrder.deliveryCharge||0}`}].map(r=>(
                  <div key={r.l} className="flex justify-between px-4 py-2.5 border-b border-slate-100">
                    <span className="text-sm text-slate-600">{r.l}</span><span className="text-sm font-semibold text-slate-800">{r.v}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 bg-slate-50">
                  <span className="text-sm font-bold text-slate-700">Grand Total</span>
                  <span className="text-sm font-bold text-teal-700">₹{viewingOrder.amount+(viewingOrder.deliveryCharge||0)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Payment Method</p>
                  <p className="text-sm font-semibold text-slate-700 capitalize">{viewingOrder.paymentMethod||"—"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Payment Proof</p>
                  {viewingOrder.paymentScreenshotUrl
                    ?<a href={viewingOrder.paymentScreenshotUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal-700 underline">View Screenshot</a>
                    :<p className="text-sm text-slate-400">Not uploaded</p>}
                </div>
              </div>
              {viewingOrder.note&&(
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-1">Customer Note</p>
                  <p className="text-sm text-amber-800">{viewingOrder.note}</p>
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 px-6 py-3 flex gap-2">
              <select className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                value={viewingOrder.paymentStatus}
                onChange={e => { handleOrderStatus(viewingOrder._id, e.target.value as OrderStatus); setViewingOrder(o => o?{...o,paymentStatus:e.target.value as OrderStatus}:o); }}>
                {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <button
                onClick={() => {
                  const o = viewingOrder;
                  const w = window.open("","_blank"); if(!w) return;
                  w.document.write(`<html><head><title>Order #${o._id.slice(-8).toUpperCase()}</title><style>body{font-family:sans-serif;padding:24px;color:#0f172a}h1{font-size:20px}h2{font-size:15px;margin-top:18px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #e2e8f0;padding:8px 12px;text-align:left}th{background:#f8fafc;font-size:11px;text-transform:uppercase}</style></head><body><h1>Order #${o._id.slice(-8).toUpperCase()}</h1><p><b>Date:</b> ${new Date(o.createdAt).toLocaleString("en-IN")}</p><p><b>Status:</b> ${STATUS_LABEL[o.paymentStatus]}</p><h2>Customer</h2><p>${o.customerName} &middot; ${o.customerPhone}</p>${o.deliveryAddress?`<p>📍 ${o.deliveryAddress}</p>`:""}<h2>Product</h2><p>${o.product?.title||"—"} ${o.product?.category?`(${o.product.category})`:""}</p><table><tr><th>Qty</th><th>Items</th><th>Delivery</th><th>Grand Total</th></tr><tr><td>${o.quantity}</td><td>₹${o.amount}</td><td>₹${o.deliveryCharge||0}</td><td><b>₹${o.amount+(o.deliveryCharge||0)}</b></td></tr></table><p style="margin-top:14px"><b>Payment:</b> ${o.paymentMethod||"—"}</p>${o.note?`<p><b>Note:</b> ${o.note}</p>`:""}<script>window.onload=()=>window.print()<\/script></body></html>`);
                  w.document.close();
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition whitespace-nowrap"
              >🖨 Print / PDF</button>
            </div>
          </div>
        </div>
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
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Account banner */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-5 py-3 shadow-card">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Store URL</p>
              <p className="text-sm font-semibold text-teal-700 truncate">{storeUrl}</p>
            </div>
            <span className="text-xs text-slate-500">Slug: <span className="font-semibold text-slate-700">{seller?.slug}</span></span>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              seller?.approvalStatus === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : seller?.approvalStatus === "rejected" ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
            }`}>
              {seller?.approvalStatus === "approved" ? "\u2713 Approved" : seller?.approvalStatus === "rejected" ? "\u2715 Rejected" : "\u23f3 Pending"}
            </span>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-5">
            {/* Business Identity */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 text-sm">🏢</span>
                Business Identity
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Business name *</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={profileName} onChange={e => setProfileName(e.target.value)} required />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Business category</span>
                  <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={profileCategory} onChange={e => setProfileCategory(e.target.value)}>
                    <option value="">— Select category —</option>
                    {["Fashion","Groceries","Food & Beverages","Electronics","Home & Kitchen","Beauty & Personal Care","Health & Wellness","Books & Stationery","Services","Other"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">GST number</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="22AAAAA0000A1Z5" value={profileGST} onChange={e => setProfileGST(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">UPI ID</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="yourname@upi" value={profileUpi} onChange={e => setProfileUpi(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Business email</span>
                  <input type="email" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="shop@example.com" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
                </label>
              </div>
            </article>

            {/* Contact Details */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 text-sm">📞</span>
                Contact Details
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Registered phone</span>
                  <input className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 outline-none cursor-not-allowed" value={seller?.phone || ""} readOnly />
                  <span className="text-xs text-slate-400">Cannot be changed</span>
                </label>
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">WhatsApp number</span>
                  <div className="flex gap-2">
                    <input className="w-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={storeWhatsapp.countryCode} onChange={e => setStoreWhatsapp(p => ({...p, countryCode: e.target.value}))} placeholder="+91" />
                    <input className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="9876543210" value={storeWhatsapp.number} onChange={e => setStoreWhatsapp(p => ({...p, number: e.target.value.replace(/\D/g,"").slice(0,15)}))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Call number</span>
                  <div className="flex gap-2">
                    <input className="w-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={storeCall.countryCode} onChange={e => setStoreCall(p => ({...p, countryCode: e.target.value}))} placeholder="+91" />
                    <input className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="9876543210" value={storeCall.number} onChange={e => setStoreCall(p => ({...p, number: e.target.value.replace(/\D/g,"").slice(0,15)}))} />
                  </div>
                </div>
              </div>
            </article>

            {/* Business Address */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 text-sm">📍</span>
                Business Address
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Address line 1</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={profileAddress.line1} onChange={e => setProfileAddress(p => ({...p, line1: e.target.value}))} />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Address line 2</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={profileAddress.line2} onChange={e => setProfileAddress(p => ({...p, line2: e.target.value}))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">City</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={profileAddress.city} onChange={e => setProfileAddress(p => ({...p, city: e.target.value}))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">State</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={profileAddress.state} onChange={e => setProfileAddress(p => ({...p, state: e.target.value}))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Country</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={profileAddress.country} onChange={e => setProfileAddress(p => ({...p, country: e.target.value}))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Landmark</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={profileAddress.landmark} onChange={e => setProfileAddress(p => ({...p, landmark: e.target.value}))} />
                </label>
              </div>
            </article>

            {/* KYC Documents */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-sm">🪺</span>
                KYC Documents
              </h3>
              <p className="text-xs text-slate-500 mb-4">Upload clear images of your documents. Required for admin verification and store approval.</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">ID Proof <span className="text-rose-500">*</span></p>
                  <p className="text-xs text-slate-400">Aadhaar, PAN, Passport, Voter ID, Driving Licence</p>
                  {profileIdProof && (
                    <a href={profileIdProof} target="_blank" rel="noreferrer">
                      <img src={profileIdProof} alt="ID Proof" className="h-28 w-full rounded-xl object-cover border border-slate-200 hover:opacity-90 transition" />
                    </a>
                  )}
                  <ImageUploadField value={profileIdProof} onChange={setProfileIdProof} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">Address Proof <span className="text-rose-500">*</span></p>
                  <p className="text-xs text-slate-400">Utility bill, Bank statement, Rental agreement (not older than 3 months)</p>
                  {profileAddressProof && (
                    <a href={profileAddressProof} target="_blank" rel="noreferrer">
                      <img src={profileAddressProof} alt="Address Proof" className="h-28 w-full rounded-xl object-cover border border-slate-200 hover:opacity-90 transition" />
                    </a>
                  )}
                  <ImageUploadField value={profileAddressProof} onChange={setProfileAddressProof} />
                </div>
              </div>
            </article>

            <button type="submit" disabled={isSavingProfile}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400 shadow-sm">
              {isSavingProfile ? "Saving…" : "💾 Save Profile"}
            </button>
          </form>
        </div>
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
