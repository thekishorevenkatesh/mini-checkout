import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import axios from "axios";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../api/client";
import { AppIcon } from "../components/ui/AppIcon";
import { AddressFields } from "../components/forms/AddressFields";
import { OrderAddressCards } from "../components/orders/OrderAddressCards";
import { getOrderShippingSummary } from "../utils/orderAddresses";
import { openOrderPrintDocument } from "../utils/orderPrintDocument";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import { BUSINESS_CATEGORY_OPTIONS } from "../constants/businessCategories";
import { DEFAULT_POLICY_CONTENT } from "../constants/policyDefaults";
import {
  formatAddress,
  formatPhone,
  parseAddress,
  parsePhone,
  type AddressParts,
  type PhoneParts,
} from "../utils/contactFields";
import type { Order, OrderStatus, Product, SocialLink, Banner, PaymentMode } from "../types";
import { compressImage } from "../utils/imageCompressor";
import {
  getProductCategories,
  joinCategoryTags,
  productMatchesCategory,
} from "../utils/productCategories";

type Tab = "dashboard" | "store" | "products" | "orders" | "reports" | "earnings" | "profile" | "policies";
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function normalizePan(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function isMaskedPanValue(value: string) {
  return String(value).includes("*");
}

type ProductFormVariant = {
  label: string;   // value / size  e.g. "500"
  uom: string;     // unit of measure e.g. "g", "ml", "Pack"
  amount: string;  // selling price
  mrp: string;
  isActive: boolean;
};

type ProductForm = {
  title: string; description: string; price: string; mrp: string; packSize: string; uom: string;
  imageUrls: string[]; notes: string; categories: string[]; categoryInput: string;
  variants: ProductFormVariant[]; isRecommended: boolean;
};
const PRODUCT_TITLE_MAX_LENGTH = 60;
const emptyProductForm: ProductForm = {
  title: "", description: "", price: "", mrp: "", packSize: "", uom: "",
  imageUrls: [""], notes: "", categories: [], categoryInput: "", variants: [], isRecommended: false,
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

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

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
     const compressedFile = await compressImage(file, 0.75, 1200, 1200, false);
      const form = new FormData();
      form.append("image", compressedFile);
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
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <label
          className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-emerald-100 dark:border-teal-900/40 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800 ${uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-teal-500 dark:to-sky-500">
            <AppIcon name={uploading ? "pending" : "upload"} className="text-[10px]" />
          </span>
          {uploading ? "Uploading..." : "Upload"}
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function expandImageSource(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(expandImageSource);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.flatMap(expandImageSource);
      }
    } catch (_error) {
      // Fall through to string parsing below.
    }
  }

  if (raw.includes("\n")) {
    return raw.split(/\r?\n/).flatMap(expandImageSource);
  }

  if ((raw.match(/https?:\/\//gi) || []).length > 1) {
    return raw.split(/,(?=https?:\/\/)/i).flatMap(expandImageSource);
  }

  return [raw];
}

function getProductImages(product: Product): string[] {
  const list = Array.isArray(product.imageUrls) ? product.imageUrls : expandImageSource(product.imageUrls);
  const cleaned = list.flatMap(expandImageSource).map(normalizeImageUrl).filter(Boolean);
  if (cleaned.length > 0) return cleaned;
  const fallback = expandImageSource(product.imageUrl || "").map(normalizeImageUrl).filter(Boolean);
  return fallback;
}

function getOrderItems(order: Order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items;
  }

  return order.product
    ? [{
        product: order.product,
        productTitle: order.product.title,
        productCategory: order.product.category,
        productImageUrl: order.product.imageUrl,
        variantId: "",
        variantTitle: "",
        selectedVariants: order.selectedVariants || {},
        unitPrice: order.quantity > 0 ? order.amount / order.quantity : order.amount,
        quantity: order.quantity,
        lineTotal: order.amount,
      }]
    : [];
}

function getOrderItemSummary(order: Order) {
  return getOrderItems(order)
    .map((item) => {
      const variantValues = Object.values(item.selectedVariants || {}).filter(Boolean);
      return `${item.productTitle}${variantValues.length ? ` (${variantValues.join("/")})` : ""} x${item.quantity}`;
    })
    .join(", ");
}

function getOrderPrimaryCategory(order: Order) {
  return getOrderItems(order)[0]?.productCategory || order.product?.category || "";
}

// ─── DashboardPage ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { seller, logout, updateProfile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const { showError, showSuccess } = useToast();

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
  const [profilePAN, setProfilePAN] = useState(seller?.pan || "");
  const [profilePANHolderName, setProfilePANHolderName] = useState(seller?.panHolderName || "");
  const [profilePANDocumentUrl, setProfilePANDocumentUrl] = useState(seller?.panDocumentUrl || "");
  const [profileBusinessType, setProfileBusinessType] = useState(seller?.businessType || "individual");
  const [profileLogo, setProfileLogo] = useState(seller?.businessLogo || "");
  const [profileFavicon, setProfileFavicon] = useState(seller?.favicon || "");
  const [profileCategory, setProfileCategory] = useState(seller?.businessCategory || "");
  const [profileBankAccountName, setProfileBankAccountName] = useState(seller?.bankAccountName || "");
  const [profileBankName, setProfileBankName] = useState(seller?.bankName || "");
  const [profileBankAccountNumber, setProfileBankAccountNumber] = useState(seller?.bankAccountNumber || "");
  const [profileBankIfsc, setProfileBankIfsc] = useState(seller?.bankIfsc || "");
  const [profileIdProof, setProfileIdProof] = useState(seller?.idProofUrl || "");
  const [profileAddressProof, setProfileAddressProof] = useState(seller?.addressProofUrl || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [privacyPolicy, setPrivacyPolicy] = useState<string>(DEFAULT_POLICY_CONTENT.privacyPolicy);
  const [returnRefundPolicy, setReturnRefundPolicy] = useState<string>(DEFAULT_POLICY_CONTENT.returnRefundPolicy);
  const [termsAndConditions, setTermsAndConditions] = useState<string>(DEFAULT_POLICY_CONTENT.termsAndConditions);
  const [isSavingPolicies, setIsSavingPolicies] = useState(false);

  // ── Delete confirmation states
  const [showDeleteProfileConfirm, setShowDeleteProfileConfirm] = useState(false);
  const [showDeleteStoreConfirm, setShowDeleteStoreConfirm] = useState(false);
  const [showDeleteProductConfirm, setShowDeleteProductConfirm] = useState(false);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [isDeletingStore, setIsDeletingStore] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [isSendingDeleteStoreOtp, setIsSendingDeleteStoreOtp] = useState(false);
  const [deleteStoreOtp, setDeleteStoreOtp] = useState("");
  const [deleteStoreOtpSentTo, setDeleteStoreOtpSentTo] = useState("");
  const [isSendingDeleteProfileOtp, setIsSendingDeleteProfileOtp] = useState(false);
  const [deleteProfileOtp, setDeleteProfileOtp] = useState("");
  const [deleteProfileOtpSentTo, setDeleteProfileOtpSentTo] = useState("");
  const [isSendingDeleteProductOtp, setIsSendingDeleteProductOtp] = useState(false);
  const [deleteProductOtp, setDeleteProductOtp] = useState("");
  const [deleteProductOtpSentTo, setDeleteProductOtpSentTo] = useState("");
  const [productPendingDelete, setProductPendingDelete] = useState<Product | null>(null);

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
  const [draggedBannerIndex, setDraggedBannerIndex] = useState<number | null>(null);
  const [dragOverBannerIndex, setDragOverBannerIndex] = useState<number | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(seller?.socialLinks || []);
  const [newSocialPlatform, setNewSocialPlatform] = useState("Instagram");
  const [newSocialUrl, setNewSocialUrl] = useState("");
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [isPublishingStore, setIsPublishingStore] = useState(false);

  // ── Categories
  const [categories, setCategories] = useState<string[]>(seller?.categories || []);

  // ── Reports
  const [reportDays, setReportDays] = useState(30);
  const [report, setReport] = useState<{
    totalOrders: number; totalRevenue: number;
    topProducts: { title: string; unitsSold: number; revenue: number }[];
  } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [earningsData, setEarningsData] = useState<any>(null);
  const [loadingEarnings, setLoadingEarnings] = useState(false);

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
  const storeQrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync seller into local form state
  useEffect(() => {
    if (!seller) return;
    setProfileName(seller.businessName || "");
    setProfileEmail(seller.businessEmail || "");
    setProfileUpi(seller.upiId || "");
    setProfileAddress(parseAddress(seller.businessAddress || ""));
    setProfileGST(seller.businessGST || "");
    setProfilePAN(seller.pan || "");
    setProfilePANHolderName(seller.panHolderName || "");
    setProfilePANDocumentUrl(seller.panDocumentUrl || "");
    setProfileBusinessType(seller.businessType || "individual");
    setProfileLogo(seller.businessLogo || "");
    setProfileFavicon(seller.favicon || "");
    setProfileCategory(seller.businessCategory || "");
    setProfileBankAccountName(seller.bankAccountName || "");
    setProfileBankName(seller.bankName || "");
    setProfileBankAccountNumber(seller.bankAccountNumber || "");
    setProfileBankIfsc(seller.bankIfsc || "");
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
    setDraggedBannerIndex(null);
    setDragOverBannerIndex(null);
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

  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);

  useEffect(() => {
    if (success) showSuccess(success);
  }, [showSuccess, success]);

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

  async function loadEarnings() {
    setLoadingEarnings(true);
    try {
      const response = await api.get("/auth/earnings");
      setEarningsData(response.data);
    } catch {
      setError("Could not load earnings metrics.");
    } finally {
      setLoadingEarnings(false);
    }
  }

  useEffect(() => { if (tab === "reports") void loadReport(); }, [tab, reportDays]);
  useEffect(() => { if (tab === "earnings") void loadEarnings(); }, [tab]);

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
  const unreadOrderCount = useMemo(
    () => orders.filter(order => !order.isViewed).length,
    [orders]
  );

  const storeUrl = useMemo(() => {
    if (!seller?.slug) return "";
    return `${window.location.origin}/store/${seller.slug}`;
  }, [seller?.slug]);

  const profileCategoryOptions = useMemo(() => {
    const trimmedCategory = profileCategory.trim();
    if (!trimmedCategory || BUSINESS_CATEGORY_OPTIONS.includes(trimmedCategory as typeof BUSINESS_CATEGORY_OPTIONS[number])) {
      return BUSINESS_CATEGORY_OPTIONS;
    }
    return [trimmedCategory, ...BUSINESS_CATEGORY_OPTIONS];
  }, [profileCategory]);

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

  const isStoreApproved =
    Boolean(seller?.storePublished) || seller?.approvalStatus === "approved";
  const isPublishPending =
    !isStoreApproved && seller?.approvalStatus === "pending";
  const isPublishRejected =
    !isStoreApproved && seller?.approvalStatus === "rejected";
  const isStoreDraft =
    !seller || (!isStoreApproved && seller.approvalStatus === "draft");

  useEffect(() => {
    if (!isPublishPending) return;

    const publishStatusPoller = window.setInterval(() => {
      void refreshProfile();
    }, 15000);

    return () => window.clearInterval(publishStatusPoller);
  }, [isPublishPending, refreshProfile]);

  function getApiErrorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
      const message = String(error.response?.data?.message || "").trim();
      const missingFields = Array.isArray(error.response?.data?.missingFields)
        ? error.response?.data?.missingFields
        : [];
      if (message && missingFields.length > 0) {
        return `${message} Missing: ${missingFields.join(", ")}.`;
      }
      if (message) return message;
    }
    return fallback;
  }

  async function handlePublishStore() {
    setIsPublishingStore(true); setError(""); setSuccess("");
    try {
      await api.post("/store/publish");
      await refreshProfile();
      setSuccess("Store sent to admin for approval.");
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not send store for approval."));
    }
    finally { setIsPublishingStore(false); }
  }

  function getApprovalBadgeClasses() {
    if (seller?.approvalStatus === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (seller?.approvalStatus === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
    if (seller?.approvalStatus === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  function getApprovalLabel() {
    if (seller?.approvalStatus === "approved") return "\u2713 Approved";
    if (seller?.approvalStatus === "rejected") return "\u2715 Rejected";
    if (seller?.approvalStatus === "pending") return "\u23f3 Pending Approval";
    return "Draft";
  }

  const savedProfilePan = seller?.pan ?? "";
  const normalizedProfilePAN = normalizePan(profilePAN);
  const profilePANUnchangedOnFile =
    Boolean(savedProfilePan) &&
    (profilePAN === savedProfilePan ||
      (isMaskedPanValue(profilePAN) && isMaskedPanValue(savedProfilePan)));
  const profilePANError =
    profilePAN.trim().length === 0
      ? "PAN number is required."
      : profilePANUnchangedOnFile || PAN_PATTERN.test(normalizedProfilePAN)
        ? ""
        : "Enter PAN in ABCDE1234F format.";
  const profilePANHolderNameError =
    profilePANHolderName.trim().length === 0 ? "PAN holder legal name is required." : "";
  const isProfileFormValid =
    !profilePANError && !profilePANHolderNameError && profileEmail.trim() && isValidEmail(profileEmail);

  // ── Profile save
  async function handleProfileSave(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!profileEmail.trim()) {
      setError("Business email is required.");
      return;
    }
    if (!isValidEmail(profileEmail)) {
      setError("Enter a valid business email address.");
      return;
    }
    if (profilePANError || profilePANHolderNameError) {
      setError(profilePANError || profilePANHolderNameError);
      return;
    }
    setIsSavingProfile(true);
    try {
      await updateProfile({
        businessName: profileName.trim(),
        businessEmail: profileEmail.trim(),
        upiId: profileUpi.trim(),
        bankAccountName: profileBankAccountName.trim(),
        bankName: profileBankName.trim(),
        bankAccountNumber: profileBankAccountNumber.trim(),
        bankIfsc: profileBankIfsc.trim().toUpperCase(),
        businessAddress: formatAddress(profileAddress),
        businessAddressParts: profileAddress,
        businessGST: profileGST.trim(),
        pan: profilePANUnchangedOnFile || isMaskedPanValue(profilePAN)
          ? (savedProfilePan || profilePAN)
          : normalizedProfilePAN,
        panHolderName: profilePANHolderName.trim(),
        panDocumentUrl: profilePANDocumentUrl.trim(),
        businessType: profileBusinessType,
        businessLogo: profileLogo.trim(),
        favicon: profileFavicon.trim(),
        businessCategory: profileCategory.trim(),
        idProofUrl: profileIdProof.trim(),
        addressProofUrl: profileAddressProof.trim(),
      });
      setSuccess("Profile saved.");
    } catch (error) { setError(getApiErrorMessage(error, "Could not save profile.")); }
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

  function moveBanner(fromIndex: number, toIndex: number) {
    setBanners(prev => reorderItems(prev, fromIndex, toIndex));
  }

  function handleBannerDragStart(index: number) {
    setDraggedBannerIndex(index);
    setDragOverBannerIndex(index);
  }

  function handleBannerDragOver(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    if (dragOverBannerIndex !== index) {
      setDragOverBannerIndex(index);
    }
  }

  function handleBannerDrop(index: number) {
    if (draggedBannerIndex === null) return;
    moveBanner(draggedBannerIndex, index);
    setDraggedBannerIndex(null);
    setDragOverBannerIndex(null);
  }

  function resetBannerDragState() {
    setDraggedBannerIndex(null);
    setDragOverBannerIndex(null);
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

  // ── Delete profile
  function showDeleteProfileModal() {
    setDeleteProfileOtp("");
    setDeleteProfileOtpSentTo("");
    setError("");
    setSuccess("");
    setShowDeleteProfileConfirm(true);
  }

  async function requestDeleteProfileOtp() {
    setIsSendingDeleteProfileOtp(true); setError(""); setSuccess("");
    try {
      const response = await api.post<{ message: string; email: string }>("/auth/request-delete-otp");
      setDeleteProfileOtpSentTo(response.data.email);
      setSuccess(response.data.message);
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not send deletion OTP."));
    } finally {
      setIsSendingDeleteProfileOtp(false);
    }
  }

  async function confirmDeleteProfile() {
    if (deleteProfileOtp.trim().length !== 6) {
      setError("Enter the 6-digit OTP sent to your email.");
      return;
    }

    setIsDeletingProfile(true); setError(""); setSuccess("");
    try {
      await api.post("/auth/delete-account", { otp: deleteProfileOtp.trim() });
      setSuccess("Profile deleted successfully.");
      window.setTimeout(() => {
        logout();
      }, 1000);
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not delete profile."));
    } finally {
      setIsDeletingProfile(false);
    }
  }

  // ── Delete store
  function showDeleteStoreModal() {
    setDeleteStoreOtp("");
    setDeleteStoreOtpSentTo("");
    setError("");
    setSuccess("");
    setShowDeleteStoreConfirm(true);
  }

  async function requestDeleteStoreOtp() {
    setIsSendingDeleteStoreOtp(true); setError(""); setSuccess("");
    try {
      const response = await api.post<{ message: string; email: string }>("/store/request-delete-otp");
      setDeleteStoreOtpSentTo(response.data.email);
      setSuccess(response.data.message);
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not send store deletion OTP."));
    } finally {
      setIsSendingDeleteStoreOtp(false);
    }
  }

  async function confirmDeleteStore() {
    if (deleteStoreOtp.trim().length !== 6) {
      setError("Enter the 6-digit OTP sent to your email.");
      return;
    }
    setIsDeletingStore(true); setError(""); setSuccess("");
    try {
      await api.post("/store/confirm-delete", { otp: deleteStoreOtp.trim() });
      await refreshProfile();
      await loadData();
      setSuccess("Store deleted successfully. You can set up again.");
      setShowDeleteStoreConfirm(false);
      setDeleteStoreOtp("");
      setDeleteStoreOtpSentTo("");
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not delete store."));
    } finally {
      setIsDeletingStore(false);
    }
  }

  // ── Product catalog search + filter state
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // ── Category autocomplete state
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<string | null>(null);

  function startEditSellerCategory(category: string) {
    setEditingCategory(category);
    setEditingCategoryValue(category);
    setCategoryPendingDelete(null);
    setShowSuggestions(true);
  }

  function cancelEditSellerCategory() {
    setEditingCategory(null);
    setEditingCategoryValue("");
  }

  function startDeleteSellerCategory(category: string) {
    setCategoryPendingDelete(category);
    setEditingCategory(null);
    setEditingCategoryValue("");
    setShowSuggestions(true);
  }

  function cancelDeleteSellerCategory() {
    setCategoryPendingDelete(null);
  }

  async function saveSellerCategory(originalCategory: string) {
    const nextCategory = editingCategoryValue.trim();
    if (!nextCategory) {
      showError("Category name is required.");
      return;
    }

    if (nextCategory === originalCategory) {
      cancelEditSellerCategory();
      return;
    }

    const renameCategory = (items: string[]) => (
      [...new Set(items.map((item) => (item === originalCategory ? nextCategory : item)).filter(Boolean))]
    );

    const previousCategories = categories;
    try {
      const updated = renameCategory(categories);
      setCategories(updated);
      setCategorySuggestions((prev) => renameCategory(prev));
      setProductForm((prev) => ({ ...prev, categories: renameCategory(prev.categories) }));
      setCatalogCategory((prev) => (prev === originalCategory ? nextCategory : prev));
      await api.patch("/store/categories/rename", { from: originalCategory, to: nextCategory });
      showSuccess(`Category "${originalCategory}" renamed to "${nextCategory}".`);
      cancelEditSellerCategory();
      await loadData();
    } catch {
      setCategories(previousCategories);
      showError(`Could not update category "${originalCategory}".`);
    }
  }

  async function deleteSellerCategory(category: string) {
    try {
      const updated = categories.filter((item) => item !== category);
      setCategories(updated);
      setCategorySuggestions((prev) => prev.filter((item) => item !== category));
      await api.put("/store/options", { categories: updated });
      showSuccess(`Category “${category}” removed.`);
      setCategoryPendingDelete(null);
    } catch (error) {
      showError(`Could not delete category “${category}”.`);
      // restore state on failure if needed
      setCategories((prev) => (prev.includes(category) ? prev : [...prev, category]));
      setCategorySuggestions((prev) => (prev.includes(category) ? prev : [category, ...prev]));
    }
  }

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
        const matchedVariantItem = prod.variantItems?.find(
          (item) => item.variantId === `legacy:${key}` || item.variantId === `legacy:${fallbackKey}`,
        );
        const rawMrp =
          prod.variantMrps?.[key]
          ?? prod.variantMrps?.[fallbackKey]
          ?? matchedVariantItem?.mrp;
        // Try to parse "value uom" from option string e.g. "500g" or "500 g"
        const match = option.match(/^([\d.]+)\s*([a-zA-Z]*)$/);
        variantRows.push({
          label: match ? match[1] : option,
          uom: match ? match[2] : "",
          amount: rawPrice !== undefined && rawPrice !== null ? String(rawPrice) : "",
          mrp: rawMrp !== undefined && rawMrp !== null && Number(rawMrp) > 0 ? String(rawMrp) : "",
          isActive: matchedVariantItem?.isActive ?? true,
        });
      });
    });
    setProductForm({
      title: String(prod.title || "").slice(0, PRODUCT_TITLE_MAX_LENGTH),
      description: prod.description || "",
      price: String(prod.price),
      mrp: String(prod.mrp || ""),
      packSize: prod.packSize || "",
      uom: prod.uom || "",
      imageUrls: getProductImages(prod).length > 0 ? getProductImages(prod) : [""],
      notes: prod.notes || "",
      categories: getProductCategories(prod),
      categoryInput: "",
      variants: variantRows,
      isRecommended: prod.isRecommended === true,
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
          mrp: Number(v.mrp) || 0,
          isActive: v.isActive !== false,
        }));

      const hasVariants = variantPayload.length > 0;
      const baseSellingPrice = Number(productForm.price);
      const baseMrp = Number(productForm.mrp);
      const variantPrices = variantPayload.reduce<Record<string, number>>((acc, variant) => {
        acc[getVariantPriceKey(variant.label, variant.option)] = variant.amount;
        return acc;
      }, {});
      const variantMrps = variantPayload.reduce<Record<string, number>>((acc, variant) => {
        if (variant.mrp > 0) {
          acc[getVariantPriceKey(variant.label, variant.option)] = variant.mrp;
        }
        return acc;
      }, {});
      const variantItems = variantPayload.map((variant) => ({
        variantId: `legacy:${getVariantPriceKey(variant.label, variant.option)}`,
        title: variant.option,
        attributes: { [variant.label]: variant.option },
        price: variant.amount,
        mrp: variant.mrp,
        isActive: variant.isActive,
      }));

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

      const invalidVariantPricing = variantPayload.some(
        (variant) => variant.mrp > 0 && variant.amount > 0 && variant.amount >= variant.mrp,
      );
      if (invalidVariantPricing) {
        setError("Each variant selling price should be less than its variant MRP.");
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

      const selectedCategories = productForm.categories.map((c) => c.trim()).filter(Boolean);
      const newCategories = selectedCategories.filter((c) => !categories.includes(c));
      const catTrimmed = joinCategoryTags(selectedCategories);
      const normalizedTitle = productForm.title.trim().slice(0, PRODUCT_TITLE_MAX_LENGTH);
      if (!normalizedTitle) {
        setError("Product title is required.");
        setIsSubmittingProduct(false);
        return;
      }

      const payload = {
        title: normalizedTitle,
        description: productForm.description.trim(),
        packSize: productForm.packSize.trim(),
        uom: productForm.uom.trim(),
        price: Number.isFinite(baseSellingPrice) ? baseSellingPrice : 0,
        mrp: Number(productForm.mrp) || 0,
        imageUrl: normalizedImages[0],
        imageUrls: normalizedImages,
        notes: productForm.notes.trim(),
        category: catTrimmed,
        categories: selectedCategories,
        variants: hasVariants ? [{ label: "Variant", options: variantPayload.map(v => v.option) }] : [],
        variantItems,
        variantPrices,
        variantMrps,
        isRecommended: productForm.isRecommended,
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct._id}`, payload);
        setSuccess("Product updated.");
        setEditingProduct(null);
      } else {
        await api.post("/products", payload);
        setSuccess("Product added.");
      }

      if (newCategories.length) {
        const updated = [...categories, ...newCategories];
        setCategories(updated);
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
  function handleDeleteProduct(product: Product) {
    setProductPendingDelete(product);
    setDeleteProductOtp("");
    setDeleteProductOtpSentTo("");
    setError("");
    setSuccess("");
    setShowDeleteProductConfirm(true);
  }

  async function requestDeleteProductOtp() {
    if (!productPendingDelete) return;
    setIsSendingDeleteProductOtp(true); setError(""); setSuccess("");
    try {
      const response = await api.post<{ message: string; email: string }>(`/products/${productPendingDelete._id}/request-delete-otp`);
      setDeleteProductOtpSentTo(response.data.email);
      setSuccess(response.data.message);
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not send product deletion OTP."));
    } finally {
      setIsSendingDeleteProductOtp(false);
    }
  }

  async function confirmDeleteProduct() {
    if (!productPendingDelete) return;
    if (deleteProductOtp.trim().length !== 6) {
      setError("Enter the 6-digit OTP sent to your email.");
      return;
    }
    setIsDeletingProduct(true); setError(""); setSuccess("");
    try {
      await api.post(`/products/${productPendingDelete._id}/confirm-delete`, {
        otp: deleteProductOtp.trim(),
      });
      await loadData();
      setSuccess("Product deleted.");
      setShowDeleteProductConfirm(false);
      setProductPendingDelete(null);
      setDeleteProductOtp("");
      setDeleteProductOtpSentTo("");
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not delete product."));
    } finally {
      setIsDeletingProduct(false);
    }
  }

  // ── Order status
  async function handleOrderStatus(orderId: string, status: OrderStatus) {
    try { await api.patch(`/orders/${orderId}/status`, { status }); await loadData(); }
    catch { setError("Could not update status."); }
  }

  async function handleViewOrder(order: Order) {
    setViewingOrder({ ...order, isViewed: true });

    if (order.isViewed) return;

    setOrders(current =>
      current.map(item => item._id === order._id ? { ...item, isViewed: true } : item)
    );

    try {
      await api.patch(`/orders/${order._id}/viewed`);
    } catch {
      setOrders(current =>
        current.map(item => item._id === order._id ? { ...item, isViewed: false } : item)
      );
      setViewingOrder(current =>
        current?._id === order._id ? { ...current, isViewed: false } : current
      );
      setError("Could not mark order as read.");
    }
  }

  // ── CSV export
  async function handleExport() {
    try {
      const response = await api.get("/orders/my/export", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `orders-export-${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      setSuccess("Orders exported successfully.");
    } catch {
      setError("Could not export orders.");
    }
  }

  const tabs: { key: Tab; label: string; icon: Parameters<typeof AppIcon>[0]["name"] }[] = [
    { key: "dashboard", label: t("nav.dashboard", "Dashboard"), icon: "dashboard" },
    { key: "store", label: t("nav.store", "Store Options"), icon: "store" },
    { key: "products", label: t("nav.products", "Products"), icon: "products" },
    { key: "orders", label: t("nav.orders", "Orders"), icon: "orders" },
    { key: "reports", label: t("nav.reports", "Reports"), icon: "reports" },
    { key: "earnings", label: t("nav.earnings", "Earnings & Payouts"), icon: "earnings" },
    { key: "profile", label: t("nav.profile", "Profile"), icon: "profile" },
    { key: "policies", label: t("nav.policies", "Policies"), icon: "policies" },
  ];
  const reportAverageOrderValue = report && report.totalOrders > 0
    ? Math.round(report.totalRevenue / report.totalOrders)
    : 0;
  const reportTopProduct = report?.topProducts?.[0] || null;
  const reportTopProductRevenueShare = report && report.totalRevenue > 0 && reportTopProduct
    ? Math.min(100, Math.round((reportTopProduct.revenue / report.totalRevenue) * 100))
    : 0;
  const reportTotalUnits = report
    ? report.topProducts.reduce((sum, product) => sum + product.unitsSold, 0)
    : 0;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-3 py-5 sm:px-4 sm:py-8">
      {/* Header */}
      <header className="flex flex-col gap-3 rounded-3xl border border-white/70 bg-gradient-to-br from-white via-emerald-50/70 to-sky-50/80 p-4 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-teal-900/40 dark:bg-gradient-to-br dark:from-slate-950/95 dark:via-slate-900/90 dark:to-slate-900/95">
        <div className="flex items-center gap-3">
          {seller?.businessLogo && (
            <img src={seller.businessLogo} alt="logo" className="h-10 w-10 rounded-xl object-contain border border-slate-200" />
          )}
          <div>
          
            <h1 className="font-heading text-xl font-bold text-slate-900 sm:text-2xl">{seller?.businessName || "Zensos"}</h1>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {isStoreApproved ? (
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open public store in new tab"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-emerald-400 hover:via-teal-400 hover:to-sky-400 sm:flex-none"
            >
              <AppIcon name="store" className="text-[11px]" /> Open Store
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void handlePublishStore()}
              disabled={isPublishingStore || isPublishPending}
              aria-label="Publish store for approval"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md hover:from-emerald-400 hover:via-teal-400 hover:to-sky-400 disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 transition sm:flex-none"
            >
              {isPublishingStore ? <><AppIcon name="pending" className="text-[11px]" /> Sending...</> : isPublishPending ? <><AppIcon name="pending" className="text-[11px]" /> Pending Approval</> : <><AppIcon name="share" className="text-[11px]" /> {isPublishRejected ? "Publish Store Again" : "Publish Store"}</>}
            </button>
          )}
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-slate-600 hover:to-slate-800 dark:from-slate-800 dark:to-slate-950"><AppIcon name="logout" className="text-[11px]" />Logout</button>
        </div>
      </header>

      {/* Feedback banners */}
      {copyFeedback && <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">{copyFeedback}</p>}

      {/* Tab nav */}
      <nav className="flex gap-2 overflow-x-auto pb-1 pr-1 snap-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setError(""); setSuccess(""); }}
            className={`inline-flex shrink-0 snap-start items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${tab === t.key ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 text-white shadow-md" : "border border-emerald-100 bg-white/90 text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-teal-700"}`}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full sm:h-7 sm:w-7 ${tab === t.key ? "bg-white/15" : "bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-teal-500 dark:to-sky-500"}`}>
              <AppIcon name={t.icon} className="text-[11px]" />
            </span>
            {t.label}
            {t.key === "orders" && unreadOrderCount > 0 && (
              <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm ring-1 ${tab === t.key ? "!bg-white !text-zinc-950 ring-white/70 dark:!bg-white dark:!text-zinc-950" : "bg-zinc-700 text-white ring-black/5 dark:bg-white dark:text-zinc-950 dark:ring-white/20"}`}>
                {unreadOrderCount > 99 ? "99+" : unreadOrderCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ═════════════════════════════════════ TAB: DASHBOARD ══ */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          {/* Row 1 — stat cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Total Products",
                note: "All listed items",
                value: stats.totalProducts,
                valueClass: "text-slate-900",
                icon: "products",
                iconWrapClass: "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                cardClass: "from-white via-slate-50 to-slate-100/80",
              },
              {
                label: "Active Products",
                note: "Visible in store",
                value: stats.activeProducts,
                valueClass: "text-emerald-700",
                icon: "active",
                iconWrapClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300",
                cardClass: "from-white via-emerald-50/80 to-teal-50/70",
              },
              {
                label: "Inactive Products",
                note: "Hidden from store",
                value: stats.inactiveProducts,
                valueClass: "text-rose-700",
                icon: "inactive",
                iconWrapClass: "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/45 dark:text-rose-300",
                cardClass: "from-white via-rose-50/75 to-orange-50/70",
              },
              {
                label: "Total Orders",
                note: "All customer orders",
                value: stats.totalOrders,
                valueClass: "text-slate-900",
                icon: "orders",
                iconWrapClass: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/45 dark:text-sky-300",
                cardClass: "from-white via-sky-50/75 to-cyan-50/70",
              },
              {
                label: "Pending",
                note: "Awaiting action",
                value: stats.pending,
                valueClass: "text-amber-700",
                icon: "pending",
                iconWrapClass: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/45 dark:text-amber-300",
                cardClass: "from-white via-amber-50/80 to-yellow-50/70",
              },
              {
                label: "Delivered",
                note: "Completed orders",
                value: stats.delivered,
                valueClass: "text-teal-700",
                icon: "check",
                iconWrapClass: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/45 dark:text-teal-300",
                cardClass: "from-white via-teal-50/75 to-emerald-50/70",
              },
            ].map((s) => (
              <article
                key={s.label}
                className={`group rounded-[26px] border border-white/70 bg-gradient-to-br ${s.cardClass} p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg dark:border-teal-900/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {s.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {s.note}
                    </p>
                  </div>
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${s.iconWrapClass}`}
                  >
                    <AppIcon
                      name={s.icon as Parameters<typeof AppIcon>[0]["name"]}
                      className="text-[13px]"
                    />
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <p className={`text-3xl font-bold tracking-tight ${s.valueClass}`}>{s.value}</p>
                </div>
              </article>
            ))}
          </div>

          {/* Row 2 — Revenue cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-white/70 bg-gradient-to-br from-white to-emerald-50/70 p-4 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Revenue — Last 7 Days</p>
              <p className="mt-1 text-3xl font-bold text-teal-700">₹{stats.value7d.toLocaleString("en-IN")}</p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-gradient-to-br from-white to-sky-50/70 p-4 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Revenue — Last 30 Days</p>
              <p className="mt-1 text-3xl font-bold text-teal-700">₹{stats.value30d.toLocaleString("en-IN")}</p>
            </article>
          </div>

          {/* Row 3 — QR card */}
          {storeUrl && isStoreApproved && (
            <article className="rounded-2xl border border-white/70 bg-gradient-to-br from-white via-emerald-50/60 to-sky-50/70 p-4 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                {/* QR */}
                <div className="relative shrink-0">
                  {/* <button
                    type="button"
                    onClick={() => setShowStoreQrActions(v => !v)}
                    className="block rounded-xl border-2 border-slate-200 p-1 hover:border-teal-400 transition"
                    title="Click for share / download options"
                  > */}
                    <QRCodeCanvas
                      value={storeUrl}
                      size={100}
                      ref={storeQrCanvasRef}
                      includeMargin
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                    />
                  {/* </button> */}
                  {/* {showStoreQrActions && (
                    <div className="absolute left-0 top-full z-20 mt-2 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      <button type="button" onClick={() => void shareStoreLink()} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">📤 Share</button>
                      <button type="button" onClick={downloadStoreQrCode} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">⬇ Download PNG</button>
                    </div>
                  )} */}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Your Store QR Code</p>
                  <a
                    href={storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 block break-all text-sm font-semibold text-teal-700 hover:text-teal-600 hover:underline"
                  >
                    {storeUrl}
                  </a>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => void shareStoreLink()}
                      className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 transition"
                    ><AppIcon name="share" className="text-[11px]" /> Share Store</button>
                    <button
                      type="button"
                      onClick={downloadStoreQrCode}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:from-sky-400 hover:to-cyan-500 transition"
                    ><AppIcon name="download" className="text-[11px]" /> Download QR</button>
                  </div>
                </div>
              </div>
            </article>
          )}
          {!isStoreApproved && (
            <article className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Store Publishing</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">
                {isStoreDraft ? "Publish your store when you're ready" : isPublishPending ? "Your store is waiting for admin approval" : "Your store needs approval before it can open"}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {isStoreDraft
                  ? "Save your details and products, then send the store to admin for review."
                  : isPublishPending
                    ? "You can keep using the dashboard while the approval request is under review."
                    : "Make any updates you want and publish the store again to request approval."}
              </p>
            </article>
          )}
        </div>
      )}

      {/* ══════════════════════════════════ TAB: STORE OPTIONS ══ */}
      {tab === "store" && (
        <div className="grid gap-6 min-w-0 lg:grid-cols-2">
          {/* Branding */}
          <article className="min-w-0 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-4 dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input className="w-full max-w-[8rem] rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="+91" value={storeWhatsapp.countryCode} readOnly />
                <input className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeWhatsapp.number} onChange={e => setStoreWhatsapp((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Call Number</span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input className="w-full max-w-[8rem] rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="+91" value={storeCall.countryCode} readOnly />
                <input className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" placeholder="9876543210" value={storeCall.number} onChange={e => setStoreCall((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
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
                <option value="flat_rate">Flat Delivery Charge</option>
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
              <span className="text-sm font-semibold text-slate-700">Fixed Delivery Charge (₹)</span>
              <input
                type="number" min={0}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                placeholder="0"
                value={storeDeliveryCharge}
                readOnly={storeDeliveryMode === "always_free"}
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
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm sm:flex-row sm:items-center">
                  <span className="font-semibold text-slate-700 w-full sm:w-24 shrink-0">{s.platform}</span>
                  <span className="flex-1 min-w-0 text-slate-500 truncate">{s.url}</span>
                  <button onClick={() => setSocialLinks(prev => prev.filter((_, j) => j !== i))} className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white"><AppIcon name="close" className="text-[8px]" /></button>
                </div>
              ))}
              <div className="flex flex-col gap-2 sm:flex-row">
                <select className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none bg-white sm:w-auto" value={newSocialPlatform} onChange={e => setNewSocialPlatform(e.target.value)}>
                  {SOCIAL_PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
                <input className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="https://..." value={newSocialUrl} onChange={e => setNewSocialUrl(e.target.value)} />
                <button
                  onClick={() => { if (newSocialUrl.trim()) { setSocialLinks(prev => [...prev, { platform: newSocialPlatform, url: newSocialUrl.trim() }]); setNewSocialUrl(""); } }}
                  className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-2 text-sm font-semibold text-white hover:from-emerald-400 hover:to-teal-500 transition"
                >Add</button>
              </div>
            </div>
          </article>

          {/* Banners — max 5 */}
          <article className="min-w-0 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card space-y-3 dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-slate-900">Store Banners</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-bold border ${
                banners.length >= 5
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}>{banners.length}/5</span>
            </div>
            <p className="text-xs text-slate-500">Upload up to 5 banner images. Drag banners up or down to set the order they appear in your public store carousel.</p>
            <div className="space-y-2">
              {banners.map((b, i) => (
                <div
                  key={`${b.imageUrl}-${i}`}
                  draggable
                  onDragStart={() => handleBannerDragStart(i)}
                  onDragOver={e => handleBannerDragOver(e, i)}
                  onDrop={() => handleBannerDrop(i)}
                  onDragEnd={resetBannerDragState}
                  className={`flex flex-col gap-2 rounded-xl border bg-slate-50 p-2 transition ${
                    dragOverBannerIndex === i
                      ? "border-teal-300 ring-2 ring-teal-100"
                      : "border-slate-200"
                  } ${draggedBannerIndex === i ? "opacity-70" : ""}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex flex-col items-center gap-1 px-1 text-slate-400 shrink-0 cursor-grab active:cursor-grabbing">
                      <span className="text-sm leading-none">⋮⋮</span>
                    </div>
                    {b.imageUrl && <img src={normalizeImageUrl(b.imageUrl)} alt="" className="h-12 w-20 rounded-lg object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{b.title || `Banner ${i + 1}`}</p>
                      <p className="text-xs text-slate-400 truncate">{b.imageUrl}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700">
                        Position {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBanners(prev => prev.filter((_, j) => j !== i))}
                        className="text-rose-600 text-xs font-semibold px-2 py-1 rounded-lg border border-rose-200 bg-rose-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
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
                  className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-2 text-sm font-semibold text-white hover:from-emerald-400 hover:to-teal-500 transition"
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
        <div className="grid gap-6 xl:grid-cols-2 xl:items-stretch">
          {/* Add / Edit product form */}
          <article className="min-w-0 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-xl font-bold text-slate-900">
                {editingProduct ? "✏️ Edit Product" : "Add New Product"}
              </h2>
              {editingProduct && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
                >
                  <AppIcon name="close" className="text-[10px]" /> Cancel
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700">Product Title *</span>
                    <span className="text-xs text-slate-500">{productForm.title.length}/{PRODUCT_TITLE_MAX_LENGTH}</span>
                  </div>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="Home-made Ragi Laddu"
                    value={productForm.title}
                    maxLength={PRODUCT_TITLE_MAX_LENGTH}
                    onChange={e => setProductForm(p => ({ ...p, title: e.target.value.slice(0, PRODUCT_TITLE_MAX_LENGTH) }))}
                    required
                  />
                  <p className="text-xs text-slate-500">Keep the title short so it fits nicely in the store card.</p>
                </label>
                <label className="relative block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Category</span>
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {productForm.categories.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setProductForm(p => ({ ...p, categories: p.categories.filter((item) => item !== tag) }))}
                          className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition"
                        >
                          <span className="max-w-[120px] truncate">{tag}</span>
                          <AppIcon name="close" className="text-[8px]" />
                        </button>
                      ))}
                      <input
                        className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                        placeholder="Type or select categories…"
                        value={productForm.categoryInput}
                        autoComplete="off"
                        onChange={e => {
                          const val = e.target.value;
                          setProductForm(p => ({ ...p, categoryInput: val }));
                          const q = val.trim().toLowerCase();
                          setCategorySuggestions(
                            q
                              ? categories.filter(c => c.toLowerCase().includes(q) && !productForm.categories.includes(c))
                              : categories.filter(c => !productForm.categories.includes(c))
                          );
                          setShowSuggestions(true);
                        }}
                        onFocus={() => {
                          const q = productForm.categoryInput.trim().toLowerCase();
                          setCategorySuggestions(
                            q
                              ? categories.filter(c => c.toLowerCase().includes(q) && !productForm.categories.includes(c))
                              : categories.filter(c => !productForm.categories.includes(c))
                          );
                          setShowSuggestions(true);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const nextCategory = productForm.categoryInput.trim();
                            if (nextCategory) {
                              setProductForm(p => ({
                                ...p,
                                categories: p.categories.includes(nextCategory) ? p.categories : [...p.categories, nextCategory],
                                categoryInput: "",
                              }));
                              if (!categories.includes(nextCategory)) {
                                setCategories(prev => [...prev, nextCategory]);
                              }
                              setShowSuggestions(false);
                            }
                          }
                        }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      />
                    </div>
                  </div>
                  {(showSuggestions || editingCategory) && (categorySuggestions.length > 0 || (productForm.categoryInput.trim() && !categories.includes(productForm.categoryInput.trim()))) && (
                    <ul className="absolute left-0 right-0 z-30 mt-1 w-full max-w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                      {categorySuggestions.map(c => (
                        <li key={c} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm transition bg-white hover:bg-teal-50">
                          {categoryPendingDelete === c ? (
                            <>
                              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                <p className="break-words text-sm font-semibold leading-snug text-slate-800">Delete "{c}"?</p>
                              </div>
                              <button
                                type="button"
                                onMouseDown={async (event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  await deleteSellerCategory(c);
                                }}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  cancelDeleteSellerCategory();
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                              >
                                No
                              </button>
                            </>
                          ) : editingCategory === c ? (
                            <>
                              <input
                                className="min-w-0 flex-1 rounded-lg border border-teal-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-teal-400"
                                value={editingCategoryValue}
                                autoFocus
                                onChange={(event) => setEditingCategoryValue(event.target.value)}
                                onKeyDown={async (event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    await saveSellerCategory(c);
                                  }
                                  if (event.key === "Escape") {
                                    cancelEditSellerCategory();
                                  }
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                              />
                              <button
                                type="button"
                                onMouseDown={async (event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  await saveSellerCategory(c);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                                aria-label={`Save category ${c}`}
                              >
                                <AppIcon name="check" className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  cancelEditSellerCategory();
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100"
                                aria-label={`Cancel editing category ${c}`}
                              >
                                <AppIcon name="close" className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onMouseDown={() => {
                                  setProductForm(p => ({
                                    ...p,
                                    categories: p.categories.includes(c) ? p.categories : [...p.categories, c],
                                    categoryInput: "",
                                  }));
                                  setShowSuggestions(false);
                                }}
                                className="text-left flex-1 text-slate-700 hover:text-teal-800"
                              >
                                {c}
                              </button>
                              <button
                                type="button"
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  startEditSellerCategory(c);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-600 transition hover:bg-sky-100 hover:text-sky-700"
                                aria-label={`Edit category ${c}`}
                              >
                                <AppIcon name="edit" className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onMouseDown={async (event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  startDeleteSellerCategory(c);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 hover:text-rose-700"
                                aria-label={`Delete category ${c}`}
                              >
                                <AppIcon name="trash" className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                      {productForm.categoryInput.trim() && !categories.includes(productForm.categoryInput.trim()) && (
                        <li
                          onMouseDown={() => {
                            const c = productForm.categoryInput.trim();
                            setProductForm(p => ({
                              ...p,
                              categories: p.categories.includes(c) ? p.categories : [...p.categories, c],
                              categoryInput: "",
                            }));
                            setCategories(prev => prev.includes(c) ? prev : [...prev, c]);
                            setShowSuggestions(false);
                          }}
                          className="cursor-pointer px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border-t border-slate-100 hover:bg-teal-100 transition"
                        >➕ Create "{productForm.categoryInput.trim()}"</li>
                      )}
                    </ul>
                  )}
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 transition hover:border-emerald-200">
                <input
                  type="checkbox"
                  checked={productForm.isRecommended}
                  onChange={e => setProductForm(p => ({ ...p, isRecommended: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-600 accent-emerald-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">Is it Recommended?</span>
                  <span className="block text-xs text-slate-500">Show this product in the Recommended section at the top of the public store.</span>
                </span>
              </label>

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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Pack Size</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="500"
                    value={productForm.packSize}
                    onChange={e => setProductForm(p => ({ ...p, packSize: e.target.value }))}
                  />
                  <p className="text-xs text-slate-500">Optional when you already use variants only.</p>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">UOM</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    placeholder="ml / g / pcs"
                    value={productForm.uom}
                    onChange={e => setProductForm(p => ({ ...p, uom: e.target.value }))}
                  />
                  <p className="text-xs text-slate-500">Shows with pack size on the store card.</p>
                </label>
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
                  <p className="text-xs text-slate-500 mt-0.5">Each variant has pack size, UOM, selling price, MRP, and its own active status.</p>
                </div>
                <div className="space-y-3">
                  {productForm.variants.map((v, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                        <label className="col-span-2 block min-w-0 space-y-1 lg:col-span-1">
                          <span className="text-xs font-semibold text-slate-500">Pack size</span>
                          <input
                            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                            placeholder="e.g. 500"
                            value={v.label}
                            onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], label: e.target.value }; return { ...p, variants: vv }; })}
                          />
                        </label>
                        <label className="block min-w-0 space-y-1">
                          <span className="text-xs font-semibold text-slate-500">UOM</span>
                          <input
                            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                            placeholder="g / ml"
                            value={v.uom}
                            onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], uom: e.target.value }; return { ...p, variants: vv }; })}
                          />
                        </label>
                        <label className="block min-w-0 space-y-1">
                          <span className="text-xs font-semibold text-slate-500">Selling (₹)</span>
                          <input
                            type="number"
                            min={0}
                            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                            placeholder="499"
                            value={v.amount}
                            onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], amount: e.target.value }; return { ...p, variants: vv }; })}
                          />
                        </label>
                        <label className="block min-w-0 space-y-1">
                          <span className="text-xs font-semibold text-slate-500">MRP (₹)</span>
                          <input
                            type="number"
                            min={0}
                            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                            placeholder="599"
                            value={v.mrp}
                            onChange={e => setProductForm(p => { const vv = [...p.variants]; vv[i] = { ...vv[i], mrp: e.target.value }; return { ...p, variants: vv }; })}
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setProductForm(p => {
                            const vv = [...p.variants];
                            vv[i] = { ...vv[i], isActive: !vv[i].isActive };
                            return { ...p, variants: vv };
                          })}
                          className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                            v.isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {v.isActive ? "Active" : "Inactive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductForm(p => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }))}
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition"
                          aria-label={`Remove variant ${i + 1}`}
                          title="Remove variant"
                        >
                          <AppIcon name="close" className="text-[9px]" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                <button
                  type="button"
                  onClick={() => setProductForm(p => ({ ...p, variants: [...p.variants, { label: "", uom: "", amount: "", mrp: "", isActive: true }] }))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
                >+ Add Variant</button>
              </div>
              </div>

              <div className="flex flex-wrap justify-between gap-2 pt-1">
                {editingProduct && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 sm:w-auto"
                  >
                    Cancel Edit
                  </button>
                )}
                <button type="submit" disabled={isSubmittingProduct}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${editingProduct ? "bg-amber-600 hover:bg-amber-500 sm:flex-1" : "bg-teal-600 hover:bg-teal-500"}`}>
                  {isSubmittingProduct
                    ? (editingProduct ? "Saving…" : "Saving...")
                    : editingProduct ? <><AppIcon name="edit" className="text-[10px]" /> Update Product</> : <><AppIcon name="products" className="text-[10px]" /> Add Product</>}
                </button>
              </div>
            </form>
          </article>

          {/* Product catalog */}
          <div className="h-full min-w-0">
          <article className="min-w-0 h-full flex flex-col rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
            {/* Catalog header + search */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-heading text-xl font-bold text-slate-900">Product Catalog</h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">{products.length}</span>
            </div>
            {/* Search bar with filter icon */}
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/75">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-teal-500 dark:to-sky-500"><AppIcon name="search" className="text-[10px]" /></span>
                <input
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
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
                    <AppIcon name="close" className="text-[8px]" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(v => !v)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                    catalogCategory
                      ? "border-teal-300 bg-teal-100 text-teal-700"
                      : "border-emerald-100 bg-white text-slate-400 hover:border-emerald-200 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                  title="Filter by category"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 dark:from-cyan-500 dark:to-blue-500"><AppIcon name="filter" className="text-[10px]" /></span>
                </button>
              </div>
              {/* Filter dropdown */}
              {showFilterDropdown && categories.length > 0 && (
                <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden dark:border-teal-900/40 dark:bg-slate-950">
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
                  const categoryText = getProductCategories(prod).join(" ").toLowerCase();
                  const matchSearch = !q || prod.title.toLowerCase().includes(q) || categoryText.includes(q) || (prod.category || "").toLowerCase().includes(q);
                  const matchCat = productMatchesCategory(prod, catalogCategory);
                  return matchSearch && matchCat;
                })
                .map(prod => (
                <div key={prod._id} className={`rounded-2xl border p-3 ${prod.isActive ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70" : "border-slate-100 bg-slate-100 opacity-60 dark:border-slate-800 dark:bg-slate-950/70"}`}>
                  <div className="flex items-start gap-2">
                    {getProductImages(prod)[0] && <img src={getProductImages(prod)[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate break-words">{prod.title}</p>
                      {getProductCategories(prod).length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {prod.isRecommended && (
                            <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              Recommended
                            </span>
                          )}
                          {getProductCategories(prod).map((tag) => (
                            <span
                              key={`${prod._id}-${tag}`}
                              className="inline-block rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
                              const priceKey = getVariantPriceKey(variant.label, option);
                              const variantPrice = prod.variantPrices?.[priceKey];
                              const variantMrp =
                                prod.variantMrps?.[priceKey]
                                ?? prod.variantItems?.find((item) => item.variantId === `legacy:${priceKey}`)?.mrp;
                              return (
                                <span key={option} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                  {option}
                                  {variantPrice ? (
                                    <>
                                      {" · ₹"}
                                      {variantPrice}
                                      {variantMrp && variantMrp > variantPrice ? (
                                        <span className="text-slate-400 line-through"> ₹{variantMrp}</span>
                                      ) : null}
                                    </>
                                  ) : null}
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
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition"
                    ><AppIcon name="edit" className="text-[10px]" /> Edit</button>
                    <button onClick={() => handleToggleProduct(prod._id)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${prod.isActive ? "bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200/70" : "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200/70"}`}>
                      <AppIcon name={prod.isActive ? "pending" : "check"} className="text-[10px]" />
                      {prod.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDeleteProduct(prod)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                    ><AppIcon name="close" className="text-[10px]" /> Delete</button>
                  </div>
                </div>
              ))}
              {!loading && products.filter(p => {
                const q = catalogSearch.trim().toLowerCase();
                const categoryText = getProductCategories(p).join(" ").toLowerCase();
                return (
                  (!q || p.title.toLowerCase().includes(q) || categoryText.includes(q) || (p.category || "").toLowerCase().includes(q))
                  && productMatchesCategory(p, catalogCategory)
                );
              }).length === 0 && products.length > 0 && (
                <p className="py-4 text-center text-sm text-slate-400">No products match your search / filter.</p>
              )}
            </div>
          </article>

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ TAB: ORDERS ══ */}
      {showDeleteProductConfirm && productPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm dark:bg-black/60">
          <div className="relative w-full max-w-md rounded-[28px] border border-white/70 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
                  <AppIcon name="trash" className="text-[14px]" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">Protected delete</p>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Delete product with OTP</h2>
                </div>
              </div>

              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Product</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{productPendingDelete.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This removal is permanent and cannot be undone.</p>
              </div>

              <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50/80 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">Step 1</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  Send a one-time password to <span className="font-semibold">{deleteProductOtpSentTo || seller?.businessEmail || "your saved business email"}</span>.
                </p>
              </div>

              {deleteProductOtpSentTo ? (
                <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Step 2</p>
                  <label className="mt-2 block space-y-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enter the 6-digit OTP</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xl font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      placeholder="------"
                      maxLength={6}
                      value={deleteProductOtp}
                      onChange={(e) => setDeleteProductOtp(e.target.value.replace(/\D/g, ""))}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={requestDeleteProductOtp}
                    disabled={isSendingDeleteProductOtp || isDeletingProduct}
                    className="mt-3 text-xs font-semibold text-sky-700 underline underline-offset-4 disabled:opacity-60 dark:text-sky-300"
                  >
                    {isSendingDeleteProductOtp ? "Sending..." : "Resend OTP"}
                  </button>
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteProductConfirm(false);
                    setProductPendingDelete(null);
                    setDeleteProductOtp("");
                    setDeleteProductOtpSentTo("");
                  }}
                  disabled={isDeletingProduct || isSendingDeleteProductOtp}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                {deleteProductOtpSentTo ? (
                  <button
                    onClick={confirmDeleteProduct}
                    disabled={isDeletingProduct || deleteProductOtp.trim().length !== 6}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-rose-500 hover:to-red-500 disabled:opacity-50"
                  >
                    {isDeletingProduct ? (
                      <>
                        <AppIcon name="pending" className="text-[11px]" />
                        Verifying...
                      </>
                    ) : (
                      "Verify OTP & Delete"
                    )}
                  </button>
                ) : (
                  <button
                    onClick={requestDeleteProductOtp}
                    disabled={isSendingDeleteProductOtp}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-teal-600 to-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-teal-500 hover:to-sky-500 disabled:opacity-50"
                  >
                    {isSendingDeleteProductOtp ? (
                      <>
                        <AppIcon name="pending" className="text-[11px]" />
                        Sending...
                      </>
                    ) : (
                      "Send OTP"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-xl font-bold text-slate-900 dark:text-white">Orders</h2>
              {unreadOrderCount > 0 && (
                <span className="rounded-full bg-zinc-700 px-2.5 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-black/5 dark:bg-white dark:text-zinc-950 dark:ring-white/20">
                  {unreadOrderCount} unread
                </span>
              )}
            </div>
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
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/75">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-teal-500 dark:to-sky-500"><AppIcon name="search" className="text-[10px]" /></span>
              <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search by customer, product or category…" value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />
              {(orderStatusFilter || orderCategoryFilter) && (
                <button type="button" onClick={() => { setOrderStatusFilter(""); setOrderCategoryFilter(""); }}
                  className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition">
                  {[orderStatusFilter && STATUS_LABEL[orderStatusFilter as OrderStatus], orderCategoryFilter].filter(Boolean).join(" ? ")} <AppIcon name="close" className="text-[8px]" />
                </button>
              )}
              <button type="button" onClick={() => setShowOrderFilter(v => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${ (orderStatusFilter || orderCategoryFilter) ? "border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/50 dark:text-teal-300" : "border-emerald-100 bg-white text-slate-400 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"}`}>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 dark:from-cyan-500 dark:to-blue-500"><AppIcon name="filter" className="text-[10px]" /></span>
              </button>
            </div>
            {showOrderFilter && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden dark:border-teal-900/40 dark:bg-slate-950">
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
              const itemSummary = getOrderItemSummary(o).toLowerCase();
              const primaryCategory = getOrderPrimaryCategory(o).toLowerCase();
              const matchQ = !q || o.customerName.toLowerCase().includes(q) || o.customerPhone.includes(q) || itemSummary.includes(q) || primaryCategory.includes(q);
              const matchS = !orderStatusFilter || o.paymentStatus === orderStatusFilter;
              const matchC = !orderCategoryFilter || getOrderPrimaryCategory(o) === orderCategoryFilter;
              return matchQ && matchS && matchC;
            });
            return (
              <>
                {/* Mobile cards */}
                <div className="mt-4 space-y-3 md:hidden">
                  {filtered.map(order => {
                    const isUnread = !order.isViewed;
                    return (
                    <article key={order._id} className={`rounded-2xl border p-3 transition ${isUnread ? "border-zinc-400 bg-zinc-200 shadow-md dark:border-zinc-600 dark:bg-zinc-800 [&>p]:text-zinc-800 dark:[&>p]:text-zinc-100 [&>p>strong]:text-zinc-950 dark:[&>p>strong]:text-white" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`font-semibold ${isUnread ? "text-zinc-950 dark:text-white" : "text-slate-800 dark:text-slate-100"}`}>{order.customerName}</p>
                            {isUnread && <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-zinc-300 dark:text-zinc-950">Unread</span>}
                          </div>
                          <p className={`text-xs ${isUnread ? "text-zinc-700 dark:text-zinc-300" : "text-slate-500 dark:text-slate-400"}`}>{order.customerPhone}</p>
                          {getOrderShippingSummary(order) && <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${isUnread ? "text-zinc-700 dark:text-zinc-300" : "text-slate-400"}`}><span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-teal-500 dark:to-sky-500"><AppIcon name="location" className="text-[8px]" /></span><span className="line-clamp-2">{getOrderShippingSummary(order)}</span></p>}
                        </div>
                        <span className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[order.paymentStatus]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[order.paymentStatus]}`} />{STATUS_LABEL[order.paymentStatus]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{getOrderItemSummary(order)||"—"}</p>
                      <p className="text-xs text-slate-500">Qty: {order.quantity} · ₹{order.amount} + ₹{order.deliveryCharge||0} = <strong>₹{order.amount+(order.deliveryCharge||0)}</strong></p>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => void handleViewOrder(order)} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">👁 View</button>
                        <select className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none" value={order.paymentStatus} onChange={e => handleOrderStatus(order._id, e.target.value as OrderStatus)}>
                          {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </div>
                    </article>
                    );
                  })}
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
                      {filtered.map(order => {
                        const isUnread = !order.isViewed;
                        return (
                        <tr key={order._id} className={`border-b transition ${isUnread ? "border-zinc-300 bg-zinc-200 hover:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 [&_td]:text-zinc-800 dark:[&_td]:text-zinc-200 [&_td_p]:text-zinc-900 dark:[&_td_p]:text-zinc-100" : "border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/50"}`}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <p className={`font-semibold whitespace-nowrap ${isUnread ? "text-zinc-950 dark:text-white" : "text-slate-800 dark:text-slate-100"}`}>{order.customerName}</p>
                              {isUnread && <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-zinc-300 dark:text-zinc-950">Unread</span>}
                            </div>
                            <p className={`text-xs ${isUnread ? "text-zinc-700 dark:text-zinc-300" : "text-slate-500 dark:text-slate-400"}`}>{order.customerPhone}</p>
                            {getOrderShippingSummary(order) && <p className={`flex items-center gap-1.5 text-xs max-w-[160px] truncate ${isUnread ? "text-zinc-700 dark:text-zinc-300" : "text-slate-400"}`} title={getOrderShippingSummary(order)}><span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-teal-500 dark:to-sky-500"><AppIcon name="location" className="text-[8px]" /></span>{getOrderShippingSummary(order)}</p>}
                          </td>
                          <td className="py-3 pr-4">
                            <p className="text-slate-700">{getOrderItemSummary(order)||"—"}</p>
                            {getOrderPrimaryCategory(order) && <p className="text-xs text-teal-700">{getOrderPrimaryCategory(order)}</p>}
                          </td>
                          <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">{getOrderItems(order).map((item) => item.variantTitle || Object.values(item.selectedVariants || {}).join(", ") || "—").join(" | ")}</td>
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
                            <button onClick={() => void handleViewOrder(order)} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-1 text-xs font-semibold text-white hover:from-emerald-400 hover:to-teal-500 transition whitespace-nowrap"><AppIcon name="orders" className="text-[9px]" /> View</button>
                          </td>
                        </tr>
                        );
                      })}
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
          <div className="relative w-full max-w-lg rounded-3xl border border-white/70 bg-white shadow-2xl overflow-hidden dark:border-teal-900/40 dark:bg-gradient-to-b dark:from-slate-950 dark:to-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-6 py-4 dark:border-teal-900/30">
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">Order Details</h3>
                <p className="text-xs text-slate-400">#{viewingOrder._id.slice(-8).toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[viewingOrder.paymentStatus]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[viewingOrder.paymentStatus]}`} />{STATUS_LABEL[viewingOrder.paymentStatus]}
                </span>
                <button onClick={() => setViewingOrder(null)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 transition hover:from-emerald-400 hover:to-teal-500 dark:from-teal-500 dark:to-sky-500"><AppIcon name="close" className="text-[10px]" /></button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[70vh] px-4 py-4 space-y-4 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/80">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Customer</p>
                  <p className="font-semibold text-slate-800">{viewingOrder.customerName}</p>
                  <p className="text-sm text-slate-600">{viewingOrder.customerPhone}</p>
                  {viewingOrder.customerEmail && <p className="break-all text-sm text-slate-600">{viewingOrder.customerEmail}</p>}
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/80">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Order Date</p>
                  <p className="text-sm text-slate-700">{new Date(viewingOrder.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>
                  <p className="text-xs text-slate-400">{new Date(viewingOrder.createdAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p>
                </div>
              </div>
              <OrderAddressCards order={viewingOrder} />
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/80">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Product</p>
                <div className="space-y-2">
                  {getOrderItems(viewingOrder).map((item, index) => (
                    <div key={`${item.productTitle}-${item.variantId}-${index}`}>
                      <p className="font-semibold text-slate-800">{item.productTitle}</p>
                      {item.productCategory && <span className="inline-block mt-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{item.productCategory}</span>}
                      <p className="mt-1 text-xs text-slate-500">{item.variantTitle || Object.values(item.selectedVariants || {}).join(", ") || "Default"} · Qty {item.quantity} · ₹{item.lineTotal}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {[{l:"Quantity",v:viewingOrder.quantity},{l:"Amount Total",v:`₹${viewingOrder.amount}`},{l:"Delivery Charge",v:`₹${viewingOrder.deliveryCharge||0}`}].map(r=>(
                  <div key={r.l} className="flex justify-between px-4 py-2.5 border-b border-slate-100">
                    <span className="text-sm text-slate-600">{r.l}</span><span className="text-sm font-semibold text-slate-800">{r.v}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 bg-slate-50">
                  <span className="text-sm font-bold text-slate-700">Grand Total</span>
                  <span className="text-sm font-bold text-teal-700">₹{viewingOrder.amount+(viewingOrder.deliveryCharge||0)}</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-1">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/80">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Payment Method</p>
                  <p className="text-sm font-semibold text-slate-700 capitalize">{viewingOrder.paymentMethod||"—"}</p>
                </div>
              </div>
              {viewingOrder.paymentScreenshotUrl && (
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/80">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Payment Proof</p>
                  <a href={viewingOrder.paymentScreenshotUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal-700 underline">View Screenshot</a>
                </div>
              )}
              {viewingOrder.note&&(
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-1">Customer Note</p>
                  <p className="text-sm text-amber-800">{viewingOrder.note}</p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 dark:border-teal-900/30 sm:flex-row sm:px-6">
              <select className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                value={viewingOrder.paymentStatus}
                onChange={e => { handleOrderStatus(viewingOrder._id, e.target.value as OrderStatus); setViewingOrder(o => o?{...o,paymentStatus:e.target.value as OrderStatus}:o); }}>
                {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <button
                onClick={() => {
                  openOrderPrintDocument(viewingOrder, seller, {
                    status: STATUS_LABEL,
                  });
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto sm:whitespace-nowrap"
              ><AppIcon name="orders" className="text-[10px]" /> Print / PDF</button>
            </div>
          </div>
        </div>
      )}


      {/* Reports */}
      {tab === "reports" && (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[30px] border border-white/70 bg-gradient-to-br from-white via-emerald-50/70 to-sky-50/80 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">Analytics overview</p>
                <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Sales performance at a glance</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Track order volume, revenue quality, and top-selling products in the same visual language as the rest of your dashboard.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="inline-flex rounded-2xl border border-white/80 bg-white/85 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                  {[7, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => setReportDays(d)}
                      className={reportDays === d ? "rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm" : "rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}
                    >
                      {d === 7 ? "Last 7 days" : "Last 30 days"}
                    </button>
                  ))}
                </div>
                <button onClick={handleExport} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
                  <AppIcon name="download" className="text-[11px]" /> Export Report
                </button>
              </div>
            </div>
          </section>

          {loadingReport ? (
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-10 text-center shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white shadow-sm">
                <AppIcon name="pending" className="text-[14px]" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Preparing your report...</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pulling orders, revenue, and product performance for the selected window.</p>
            </div>
          ) : report ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-5 shadow-card dark:border-teal-900/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total Orders</p>
                      <p className="mt-1 text-xs text-slate-500">Confirmed non-cancelled orders</p>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><AppIcon name="orders" className="text-[12px]" /></span>
                  </div>
                  <p className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{report.totalOrders}</p>
                  <p className="mt-2 text-xs text-slate-500">{"Across the last " + reportDays + " days"}</p>
                </article>
                <article className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white via-emerald-50/80 to-teal-50/70 p-5 shadow-card dark:border-teal-900/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total Revenue</p>
                      <p className="mt-1 text-xs text-slate-500">Value captured in period</p>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300"><AppIcon name="reports" className="text-[12px]" /></span>
                  </div>
                  <p className="mt-6 text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">₹{report.totalRevenue.toLocaleString("en-IN")}</p>
                  <p className="mt-2 text-xs text-slate-500">Revenue for the active range</p>
                </article>
                <article className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white via-sky-50/75 to-cyan-50/70 p-5 shadow-card dark:border-teal-900/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Avg. Order Value</p>
                      <p className="mt-1 text-xs text-slate-500">Revenue per completed order</p>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/45 dark:text-sky-300"><AppIcon name="dashboard" className="text-[12px]" /></span>
                  </div>
                  <p className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">₹{reportAverageOrderValue.toLocaleString("en-IN")}</p>
                  <p className="mt-2 text-xs text-slate-500">{"Based on " + (report.totalOrders || 0) + " orders"}</p>
                </article>
                <article className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white via-amber-50/80 to-orange-50/70 p-5 shadow-card dark:border-teal-900/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Units Sold</p>
                      <p className="mt-1 text-xs text-slate-500">Total product quantities moved</p>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/45 dark:text-amber-300"><AppIcon name="products" className="text-[12px]" /></span>
                  </div>
                  <p className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{reportTotalUnits}</p>
                  <p className="mt-2 text-xs text-slate-500">{"From " + report.topProducts.length + " selling product" + (report.topProducts.length === 1 ? "" : "s")}</p>
                </article>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <article className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top products</p>
                      <h3 className="mt-1 font-heading text-xl font-bold text-slate-900 dark:text-white">Best-selling catalogue items</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">See which products are driving the strongest revenue in this selected period.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-right dark:border-slate-800 dark:bg-slate-900/70">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Top performer</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{reportTopProduct?.title || "No sales yet"}</p>
                      <p className="mt-1 text-xs text-slate-500">{reportTopProduct ? "₹" + reportTopProduct.revenue.toLocaleString("en-IN") + " revenue" : "No revenue in this window"}</p>
                    </div>
                  </div>

                  {report.topProducts.length === 0 ? (
                    <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"><AppIcon name="reports" className="text-[12px]" /></div>
                      <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">No sales data for this period</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Once orders come in, your top products and performance mix will appear here.</p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {report.topProducts.map((product, index) => {
                        const leaderRevenue = report.topProducts[0]?.revenue || 1;
                        const revenueWidth = Math.max(10, Math.min(100, (product.revenue / leaderRevenue) * 100));
                        const rankClass = index === 0 ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white" : index === 1 ? "bg-gradient-to-br from-sky-500 to-cyan-600 text-white" : "bg-gradient-to-br from-amber-400 to-orange-500 text-white";
                        return (
                          <div key={product.title + "-" + index} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 transition hover:border-emerald-200 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-teal-800">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-3">
                                  <span className={"inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold shadow-sm " + rankClass}>#{index + 1}</span>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{product.title}</p>
                                    <p className="text-xs text-slate-500">{product.unitsSold} unit{product.unitsSold === 1 ? "" : "s"} sold</p>
                                  </div>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" style={{ width: String(revenueWidth) + "%" }} />
                                </div>
                              </div>
                              <div className="grid shrink-0 grid-cols-2 gap-3 lg:w-[230px]">
                                <div className="rounded-2xl border border-white/80 bg-white px-3 py-2 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Revenue</p>
                                  <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">₹{product.revenue.toLocaleString("en-IN")}</p>
                                </div>
                                <div className="rounded-2xl border border-white/80 bg-white px-3 py-2 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Share</p>
                                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{report.totalRevenue > 0 ? Math.round((product.revenue / report.totalRevenue) * 100) : 0}%</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <div className="space-y-4">
                  <article className="rounded-[28px] border border-white/70 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-5 text-white shadow-card dark:border-teal-900/35">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Performance snapshot</p>
                    <h3 className="mt-2 font-heading text-xl font-bold">Revenue concentration</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{reportTopProduct ? reportTopProduct.title + " contributes " + reportTopProductRevenueShare + "% of your total revenue in this range." : "Your next order will start shaping this report."}</p>
                    <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Lead product revenue</p>
                          <p className="mt-1 text-3xl font-bold">{reportTopProduct ? "₹" + reportTopProduct.revenue.toLocaleString("en-IN") : "₹0"}</p>
                        </div>
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">{"Last " + reportDays + " days"}</span>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-300" style={{ width: String(Math.max(8, reportTopProductRevenueShare)) + "%" }} />
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Report summary</p>
                    <div className="mt-4 space-y-3">
                      {[
                        { label: "Active period", value: "Last " + reportDays + " days" },
                        { label: "Products generating sales", value: String(report.topProducts.length) },
                        { label: "Total units sold", value: String(reportTotalUnits) },
                        { label: "Average revenue per order", value: "₹" + reportAverageOrderValue.toLocaleString("en-IN") },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                          <span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-10 text-center shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Report data is not available yet.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try refreshing after some orders are placed.</p>
            </div>
          )}
        </div>
      )}
      {tab === "earnings" && (
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Earnings Header Summary Cards */}
          {loadingEarnings ? (
            <div className="text-center py-10 text-slate-500">Loading earnings ledger...</div>
          ) : earningsData ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-3xl border border-white/70 bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Gross Sales</p>
                  <p className="mt-2 font-heading text-2xl font-bold">₹{earningsData.summary.grossRevenue.toLocaleString("en-IN")}</p>
                  <p className="text-[10px] text-emerald-200 mt-1">Total revenue processed before splits</p>
                </article>
                <article className="rounded-3xl border border-white/70 bg-gradient-to-br from-teal-600 to-sky-600 p-5 text-white shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">Direct Settlements</p>
                  <p className="mt-2 font-heading text-2xl font-bold">₹{earningsData.summary.netEarnings.toLocaleString("en-IN")}</p>
                  <p className="text-[10px] text-teal-200 mt-1">Transferred to your linked account after each payment</p>
                </article>
                <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Refunds & Reversals</p>
                  <p className="mt-2 font-heading text-2xl font-bold text-slate-900 dark:text-white">₹{(earningsData.summary.refunds ?? earningsData.summary.reversals).toLocaleString("en-IN")}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Amounts clawed back from refunds</p>
                </article>
                <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Delivery Fees</p>
                  <p className="mt-2 font-heading text-2xl font-bold text-slate-900 dark:text-white">₹{earningsData.summary.deliveryFees.toLocaleString("en-IN")}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Total delivery earnings retained</p>
                </article>
              </div>

              {/* Transaction Ledger Table */}
              <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-slate-900/90">
                <div className="mb-4">
                  <h3 className="font-heading text-base font-bold text-slate-800 dark:text-white">Transaction & Payout Ledger</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Direct vendor settlements via Razorpay Route after payment capture</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                        <th className="py-2.5 px-2">Date</th>
                        <th className="py-2.5 px-2">Transaction Ref</th>
                        <th className="py-2.5 px-2">Purpose</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earningsData.ledger.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-slate-500">No direct settlements recorded yet.</td>
                        </tr>
                      ) : (
                        earningsData.ledger.map((log: any) => (
                          <tr key={log._id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-2 text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleDateString("en-IN")}</td>
                            <td className="py-3 px-2 font-mono text-slate-700 dark:text-slate-300 font-semibold">{log.razorpayTransferId || "platform_ledger"}</td>
                            <td className="py-3 px-2">
                              <span className="capitalize">{log.purpose.replace(/_/g, " ")}</span>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 font-bold uppercase text-[9px] ${log.type === "credit" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                                {log.type}
                              </span>
                            </td>
                            <td className={`py-3 px-2 text-right font-bold font-mono ${log.type === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                              {log.type === "credit" ? "+" : "-"}₹{(log.amountPaise / 100).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          ) : (
            <div className="text-center py-10 text-slate-500">Failed to load earnings metrics.</div>
          )}
        </div>
      )}
      {tab === "profile" && (
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Account banner */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-5 py-3 shadow-card">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Store URL</p>
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm font-semibold text-teal-700 hover:text-teal-600 hover:underline"
                title={storeUrl}
              >
                {storeUrl}
              </a>
            </div>
            <span className="text-xs text-slate-500">Slug: <span className="font-semibold text-slate-700">{seller?.slug}</span></span>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getApprovalBadgeClasses()}`}>
              {getApprovalLabel()}
            </span>
          </div>

          {seller?.razorpayOnboardingError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 dark:border-rose-800/50 dark:bg-rose-950/40">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white text-sm">!</span>
              <div>
                <p className="text-sm font-bold text-rose-800 dark:text-rose-300">Razorpay onboarding needs attention</p>
                <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">{seller.razorpayOnboardingError}</p>
              </div>
            </div>
          ) : null}

          {/* ── Razorpay Payout Account Status Banner ── */}
          {(() => {
            const rzpStatus = seller?.razorpayAccountStatus;
            if (seller?.payoutStatus === "blocked" || seller?.kycStatus !== "verified" || seller?.panVerificationStatus !== "verified") {
              return (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/50 dark:bg-amber-950/40">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-white text-sm">!</span>
                  <div>
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Payouts Blocked Until PAN KYC Is Verified</p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      Add a valid PAN, PAN holder legal name, bank details, and KYC proofs. Admin approval and Razorpay linked account activation require verified PAN KYC before direct settlements can be sent.
                    </p>
                  </div>
                </div>
              );
            }
            if (rzpStatus === "active") {
              return (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-800/50 dark:bg-emerald-950/40">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white text-sm">✓</span>
                  <div>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Payout Account Active</p>
                    <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                      Your Razorpay linked account is verified and active. When a customer pays, your full order amount is transferred directly to your linked account.
                    </p>
                  </div>
                </div>
              );
            }
            if (rzpStatus === "pending") {
              return (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/50 dark:bg-amber-950/40">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-white text-sm">⏳</span>
                  <div>
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Payout Account — Pending Activation</p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      Your linked account has been created and is pending Razorpay's KYC review. This usually takes 1–3 business days. Settlements begin once activation completes.
                    </p>
                  </div>
                </div>
              );
            }
            if (rzpStatus === "suspended") {
              return (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 dark:border-rose-800/50 dark:bg-rose-950/40">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white text-sm">✕</span>
                  <div>
                    <p className="text-sm font-bold text-rose-800 dark:text-rose-300">Payout Account Suspended</p>
                    <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">
                      Your Razorpay linked account has been suspended. Contact the platform admin to resolve this issue.
                    </p>
                  </div>
                </div>
              );
            }
            // uncreated — show what's needed
            return (
              <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 dark:border-sky-800/50 dark:bg-sky-950/40">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white text-sm">ℹ</span>
                <div>
                  <p className="text-sm font-bold text-sky-800 dark:text-sky-300">Payout Account Not Yet Set Up</p>
                  <p className="mt-0.5 text-xs text-sky-700 dark:text-sky-400">
                    To receive automatic payouts, fill in your <strong>Bank Account details</strong> and <strong>Business Type</strong> below, then save your profile. The platform admin will create your Razorpay linked account upon approving your store.
                  </p>
                </div>
              </div>
            );
          })()}

          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">Registered details</p>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">Seller profile</h3>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {seller?.createdAt ? new Date(seller.createdAt).toLocaleDateString() : "New seller"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Business name", value: seller?.businessName },
                { label: "Category", value: seller?.businessCategory },
                { label: "Business email", value: seller?.businessEmail },
                { label: "Registered phone", value: seller?.phone },
                { label: "GST number", value: seller?.businessGST },
                { label: "PAN", value: seller?.pan },
                { label: "PAN holder", value: seller?.panHolderName },
                { label: "PAN verification", value: seller?.panVerificationStatus },
                { label: "KYC status", value: seller?.kycStatus },
                { label: "Payout status", value: seller?.payoutStatus },
                { label: "Route onboarding", value: seller?.linkedAccountOnboardingStatus?.replace(/_/g, " ") },
                { label: "Linked account", value: seller?.razorpayAccountId ? `${seller.razorpayAccountStatus || "pending"}` : "Not created" },
                { label: "Business address", value: seller?.businessAddress },
                { label: "UPI ID", value: seller?.upiId },
                { label: "Account holder", value: seller?.bankAccountName },
                { label: "Bank name", value: seller?.bankName },
                { label: "Account number", value: seller?.bankAccountNumber },
                { label: "IFSC code", value: seller?.bankIfsc },
                { label: "WhatsApp", value: seller?.whatsappNumber },
                { label: "Call number", value: seller?.callNumber },
                { label: "ID proof", value: seller?.idProofUrl ? "Uploaded" : "" },
                { label: "Address proof", value: seller?.addressProofUrl ? "Uploaded" : "" },
                { label: "PAN document", value: seller?.panDocumentUrl ? "Uploaded" : "" },
              ].map(({ label, value }) => (
                <div key={label} className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{value || "Not added"}</p>
                </div>
              ))}
            </div>
          </article>

          <form onSubmit={handleProfileSave} noValidate className="space-y-5">
            {/* Business Identity */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
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
                    {profileCategoryOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">GST number</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100" placeholder="22AAAAA0000A1Z5" value={profileGST} onChange={e => setProfileGST(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">PAN details</span>
                  <input
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm uppercase outline-none focus:ring-2 dark:bg-slate-900 dark:text-slate-100 ${profilePAN && profilePANError ? "border-rose-300 focus:border-rose-400 focus:ring-rose-50 dark:border-rose-700" : "border-slate-200 focus:border-teal-400 focus:ring-teal-50 dark:border-slate-700"}`}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    value={profilePAN}
                    onChange={(e) => {
                      const next = e.target.value.toUpperCase();
                      setProfilePAN(next.includes("*") ? next.replace(/[^A-Z0-9*]/g, "").slice(0, 10) : normalizePan(next));
                    }}
                    required={!profilePANUnchangedOnFile}
                  />
                  {profilePANError ? (
                    <span className="text-xs text-rose-600">{profilePANError}</span>
                  ) : profilePANUnchangedOnFile ? (
                    <span className="text-xs text-slate-400">PAN is saved on file. Enter a new full PAN only if you need to change it.</span>
                  ) : (
                    <span className="text-xs text-slate-400">Mandatory for Razorpay linked account creation and settlements.</span>
                  )}
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">PAN holder legal name *</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100" placeholder="Name exactly as on PAN" value={profilePANHolderName} onChange={e => setProfilePANHolderName(e.target.value)} required />
                  {profilePANHolderNameError ? <span className="text-xs text-rose-600">{profilePANHolderNameError}</span> : null}
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Business type</span>
                  <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100" value={profileBusinessType} onChange={e => setProfileBusinessType(e.target.value)}>
                    <option value="individual">Individual / Proprietorship</option>
                    <option value="partnership">Partnership</option>
                    <option value="company">Private / Public Company</option>
                    <option value="llp">Limited Liability Partnership (LLP)</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Business email</span>
                  <input type="email" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100" placeholder="shop@example.com" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
                </label>
              </div>
            </article>

            {/* Bank & Payments */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-sm">₹</span>
                Bank & Payments
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">UPI ID</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="yourname@upi" value={profileUpi} onChange={e => setProfileUpi(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Account holder name</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="Name as per bank account" value={profileBankAccountName} onChange={e => setProfileBankAccountName(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Bank name</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="HDFC Bank" value={profileBankName} onChange={e => setProfileBankName(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Account number</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="123456789012" value={profileBankAccountNumber} onChange={e => setProfileBankAccountNumber(e.target.value.replace(/\D/g, ""))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">IFSC code</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-teal-400" placeholder="HDFC0001234" value={profileBankIfsc} onChange={e => setProfileBankIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} />
                </label>
              </div>
            </article>

            {/* Contact Details */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600"><AppIcon name="phone" className="text-[10px]" /></span>
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
                    <input className="w-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={storeWhatsapp.countryCode} readOnly disabled placeholder="+91" />
                    <input className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="9876543210" value={storeWhatsapp.number} onChange={e => setStoreWhatsapp(p => ({...p, number: e.target.value.replace(/\D/g,"").slice(0,15)}))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Call number</span>
                  <div className="flex gap-2">
                    <input className="w-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" value={storeCall.countryCode} readOnly disabled placeholder="+91" />
                    <input className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" placeholder="9876543210" value={storeCall.number} onChange={e => setStoreCall(p => ({...p, number: e.target.value.replace(/\D/g,"").slice(0,15)}))} />
                  </div>
                </div>
              </div>
            </article>

            {/* Business Address */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600"><AppIcon name="location" className="text-[10px]" /></span>
                Business Address
              </h3>
              <AddressFields
                value={profileAddress}
                onChange={setProfileAddress}
                inputClassName="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400"
                gridClassName="grid gap-3 sm:grid-cols-2"
              />
            </article>

            {/* KYC Documents */}
            <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
              <h3 className="font-heading text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-sm">🪺</span>
                KYC Documents
              </h3>
              <p className="text-xs text-slate-500 mb-4">Upload clear images of your documents. Required for admin verification and store approval.</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">PAN Document <span className="text-rose-500">*</span></p>
                  <p className="text-xs text-slate-400">Upload when requested for PAN review</p>
                  {profilePANDocumentUrl && (
                    <a href={profilePANDocumentUrl} target="_blank" rel="noreferrer">
                      <img src={profilePANDocumentUrl} alt="PAN Document" className="h-28 w-full rounded-xl object-cover border border-slate-200 hover:opacity-90 transition" />
                    </a>
                  )}
                  <ImageUploadField value={profilePANDocumentUrl} onChange={setProfilePANDocumentUrl} />
                </div>
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

            <button type="submit" disabled={isSavingProfile || !isProfileFormValid}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-emerald-400 hover:via-teal-400 hover:to-sky-400 disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 shadow-sm">
              {isSavingProfile ? "Saving…" : "💾 Save Profile"}
            </button>
          </form>

          <article className="mt-8 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
            <div className="mb-5 flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white shadow-sm">
                <AppIcon name="pending" className="text-[12px]" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Account protection</p>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">Sensitive account actions</h3>
                
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-900/30 dark:from-amber-950/20 dark:to-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reset store data</p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Clears products and storefront settings, but keeps your seller account so you can set it up again.
                </p>
                <button
                  type="button"
                  onClick={showDeleteStoreModal}
                  className="mt-4 group flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 hover:border-amber-400 dark:border-amber-700/60 dark:bg-slate-900/60 dark:text-amber-300 dark:hover:bg-amber-950/30"
                >
                  <AppIcon name="trash" className="text-[13px]" />
                  Delete Store & Products
                </button>
              </div>

              <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4 dark:border-rose-900/30 dark:from-rose-950/20 dark:to-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delete entire account</p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Permanently removes your profile, products, and order history after email OTP verification.
                </p>
                <button
                  type="button"
                  onClick={showDeleteProfileModal}
                  className="mt-4 group flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 hover:border-rose-400 dark:border-rose-700/60 dark:bg-slate-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
                >
                  <AppIcon name="trash" className="text-[13px]" />
                  Delete Profile
                </button>
              </div>
            </div>

           
          </article>

          {/* Delete Store Confirmation Modal */}
          {showDeleteStoreConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm dark:bg-black/60">
              <div className="relative w-full max-w-md rounded-[28px] border border-white/70 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
                      <AppIcon name="trash" className="text-[14px]" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">Protected delete</p>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Delete store with OTP</h2>
                    </div>
                  </div>

                  <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">This will:</p>
                  <ul className="mb-5 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-amber-600">•</span>
                      <span>Delete all {products.length} product(s) from your store</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-amber-600">•</span>
                      <span>Reset all store customizations and settings</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-amber-600">•</span>
                      <span>Allow you to start setting up again from scratch</span>
                    </li>
                  </ul>

                  <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">Step 1</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      Send a one-time password to <span className="font-semibold">{deleteStoreOtpSentTo || seller?.businessEmail || 'your saved business email'}</span>.
                    </p>
                  </div>

                  {deleteStoreOtpSentTo ? (
                    <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Step 2</p>
                      <label className="mt-2 block space-y-2">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enter the 6-digit OTP</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xl font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          placeholder="------"
                          maxLength={6}
                          value={deleteStoreOtp}
                          onChange={(e) => setDeleteStoreOtp(e.target.value.replace(/\D/g, ''))}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={requestDeleteStoreOtp}
                        disabled={isSendingDeleteStoreOtp || isDeletingStore}
                        className="mt-3 text-xs font-semibold text-sky-700 underline underline-offset-4 disabled:opacity-60 dark:text-sky-300"
                      >
                        {isSendingDeleteStoreOtp ? 'Sending...' : 'Resend OTP'}
                      </button>
                    </div>
                  ) : null}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteStoreConfirm(false);
                        setDeleteStoreOtp('');
                        setDeleteStoreOtpSentTo('');
                      }}
                      disabled={isDeletingStore || isSendingDeleteStoreOtp}
                      className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    {deleteStoreOtpSentTo ? (
                      <button
                        onClick={confirmDeleteStore}
                        disabled={isDeletingStore || deleteStoreOtp.trim().length !== 6}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-amber-500 hover:to-orange-500 disabled:opacity-50"
                      >
                        {isDeletingStore ? (
                          <>
                            <AppIcon name="pending" className="text-[11px]" />
                            Verifying...
                          </>
                        ) : (
                          'Verify OTP & Delete'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={requestDeleteStoreOtp}
                        disabled={isSendingDeleteStoreOtp}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-teal-600 to-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-teal-500 hover:to-sky-500 disabled:opacity-50"
                      >
                        {isSendingDeleteStoreOtp ? (
                          <>
                            <AppIcon name="pending" className="text-[11px]" />
                            Sending...
                          </>
                        ) : (
                          'Send OTP'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Delete Profile Confirmation Modal */}
          {showDeleteProfileConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm dark:bg-black/60">
              <div className="relative w-full max-w-md rounded-[28px] border border-white/70 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
                      <AppIcon name="trash" className="text-[14px]" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-500">Protected delete</p>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Delete profile with OTP</h2>
                    </div>
                  </div>

                  <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">This will permanently:</p>
                  <ul className="mb-5 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-rose-600">•</span>
                      <span>Delete your account and all profile information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-rose-600">•</span>
                      <span>Remove all {products.length} product(s)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-rose-600">•</span>
                      <span>Delete all {orders.length} order record(s)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-rose-600">•</span>
                      <span>Log you out immediately</span>
                    </li>
                  </ul>

                  <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50/80 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">Step 1</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      Send a one-time password to <span className="font-semibold">{deleteProfileOtpSentTo || seller?.businessEmail || 'your saved business email'}</span>.
                    </p>
                  </div>

                  {deleteProfileOtpSentTo ? (
                    <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Step 2</p>
                      <label className="mt-2 block space-y-2">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enter the 6-digit OTP</span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xl font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          placeholder="------"
                          maxLength={6}
                          value={deleteProfileOtp}
                          onChange={(e) => setDeleteProfileOtp(e.target.value.replace(/\D/g, ''))}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={requestDeleteProfileOtp}
                        disabled={isSendingDeleteProfileOtp || isDeletingProfile}
                        className="mt-3 text-xs font-semibold text-sky-700 underline underline-offset-4 disabled:opacity-60 dark:text-sky-300"
                      >
                        {isSendingDeleteProfileOtp ? 'Sending...' : 'Resend OTP'}
                      </button>
                    </div>
                  ) : null}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteProfileConfirm(false);
                        setDeleteProfileOtp('');
                        setDeleteProfileOtpSentTo('');
                      }}
                      disabled={isDeletingProfile || isSendingDeleteProfileOtp}
                      className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    {deleteProfileOtpSentTo ? (
                      <button
                        onClick={confirmDeleteProfile}
                        disabled={isDeletingProfile || deleteProfileOtp.trim().length !== 6}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-rose-500 hover:to-red-500 disabled:opacity-50"
                      >
                        {isDeletingProfile ? (
                          <>
                            <AppIcon name="pending" className="text-[11px]" />
                            Verifying...
                          </>
                        ) : (
                          'Verify OTP & Delete'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={requestDeleteProfileOtp}
                        disabled={isSendingDeleteProfileOtp}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-teal-600 to-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-teal-500 hover:to-sky-500 disabled:opacity-50"
                      >
                        {isSendingDeleteProfileOtp ? (
                          <>
                            <AppIcon name="pending" className="text-[11px]" />
                            Sending...
                          </>
                        ) : (
                          'Send OTP'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "policies" && (
        <article className="mx-auto max-w-4xl rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card dark:border-teal-900/35 dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900">
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
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-emerald-400 hover:via-teal-400 hover:to-sky-400 disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300"
            >
              {isSavingPolicies ? "Saving..." : "Save Policies"}
            </button>
          </form>
        </article>
      )}
    </main>
  );
}

