import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api/client";
import { DEFAULT_POLICY_CONTENT } from "../constants/policyDefaults";
import { useI18n } from "../context/I18nContext";
import type { OrderStatus, PaymentMethod, Product, Seller } from "../types";

type CartItem = { quantity: number; variants: Record<string, string> };
type CartMap = Record<string, CartItem>;
type PaymentSession = {
  orderIds: string[];
  amount: number;
  transactionRef: string;
  upiLink: string;
  sellerSlug: string;
};
type PublicOrderStatus = {
  _id: string;
  paymentStatus: OrderStatus;
};
type PolicyKey = "privacyPolicy" | "returnRefundPolicy" | "termsAndConditions";

const SOCIAL_ICONS: Record<string, string> = {
  Instagram: "📸", Facebook: "👥", "Twitter/X": "🐦",
  YouTube: "▶️", LinkedIn: "💼", Website: "🌐", "Google Location": "🗺️", Other: "🔗",
};

const PAYMENT_SUCCESS_STATUSES: OrderStatus[] = ["paid", "confirmed"];
const POLL_INTERVAL_MS = 3000;
const UPI_SESSION_STORAGE_KEY = "mini-checkout-upi-session";

function createTransactionRef() {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeImageUrl(url: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildUpiLink(
  upiId: string,
  businessName: string,
  amount: number,
  transactionRef: string,
) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: businessName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: `Order ${transactionRef}`.slice(0, 35),
    tr: transactionRef,
  });
  return `upi://pay?${params.toString()}`;
}

function getVariantPriceKey(label: string, option: string) {
  return `${label}::${option}`;
}

function getNormalizedVariantGroups(product: Product) {
  const grouped = new Map<string, Set<string>>();
  for (const variant of product.variants || []) {
    const label = String(variant.label || "").trim();
    if (!label) continue;
    if (!grouped.has(label)) grouped.set(label, new Set<string>());
    for (const option of variant.options || []) {
      const cleanOption = String(option || "").trim();
      if (cleanOption) grouped.get(label)?.add(cleanOption);
    }
  }

  return Array.from(grouped.entries()).map(([label, options]) => ({
    label,
    options: Array.from(options),
  }));
}

function getProductUnitPricing(product: Product, selectedVariants: Record<string, string>) {
  let selectedVariantMrp: number | undefined;
  for (const variant of getNormalizedVariantGroups(product)) {
    const option = selectedVariants[variant.label];
    if (!option) continue;
    const variantPrice = product.variantPrices?.[getVariantPriceKey(variant.label, option)];
    const variantMrp = product.variantMrps?.[getVariantPriceKey(variant.label, option)];
    if (typeof variantPrice === "number" && variantPrice > 0) {
      if (typeof variantMrp === "number" && variantMrp > 0) {
        selectedVariantMrp = variantMrp;
      }
      return {
        price: variantPrice,
        mrp: selectedVariantMrp || product.mrp,
      };
    }
  }

  return {
    price: product.price,
    mrp: product.mrp,
  };
}

function getProductAvailableStock(product: Product, selectedVariants: Record<string, string>) {
  const quantityMap = product.variantQuantities || {};
  const stocks: number[] = [];
  for (const variant of getNormalizedVariantGroups(product)) {
    if (!variant.options?.length) continue;
    const option = selectedVariants[variant.label];
    if (!option) continue;
    const value = Number(quantityMap[getVariantPriceKey(variant.label, option)]);
    if (Number.isFinite(value) && value >= 0) {
      stocks.push(value);
    }
  }
  if (!stocks.length) return null;
  return Math.min(...stocks);
}

function withAutoSelectedSingleVariants(product: Product, selectedVariants: Record<string, string>) {
  const next = { ...selectedVariants };
  for (const variant of getNormalizedVariantGroups(product)) {
    if (!variant.options?.length) continue;
    if (!next[variant.label] && variant.options.length === 1) {
      next[variant.label] = variant.options[0];
    }
  }
  return next;
}

function hasCompleteVariantSelection(product: Product, selectedVariants: Record<string, string>) {
  for (const variant of getNormalizedVariantGroups(product)) {
    if (!variant.options?.length) continue;
    const selected = selectedVariants[variant.label];
    if (!selected || !variant.options.includes(selected)) {
      return false;
    }
  }
  return true;
}

// Simple auto-play banner carousel
function BannerCarousel({ banners }: { banners: { imageUrl: string; title?: string }[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (!banners.length) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <img src={normalizeImageUrl(banners[idx].imageUrl)} alt={banners[idx].title || "Banner"} className="w-full h-48 object-cover sm:h-64" />
      {banners[idx].title && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
          <p className="text-sm font-semibold text-white">{banners[idx].title}</p>
        </div>
      )}
      {banners.length > 1 && (
        <div className="absolute bottom-2 right-3 flex gap-1">
          {banners.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`h-2 w-2 rounded-full transition ${i === idx ? "bg-white" : "bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PublicStorePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { sellerSlug } = useParams<{ sellerSlug: string }>();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"latest" | "price_low" | "price_high" | "discount">("latest");
  const [maxPriceFilter, setMaxPriceFilter] = useState<number | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState("");
  const [variantErrorProductId, setVariantErrorProductId] = useState<string | null>(null);

  // Checkout fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("prepaid");

  // Payment proof
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofSuccess, setProofSuccess] = useState("");

  const [intentFeedback, setIntentFeedback] = useState("");
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [orderStatuses, setOrderStatuses] = useState<Record<string, OrderStatus>>({});
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [activePolicy, setActivePolicy] = useState<PolicyKey | null>(null);

  useEffect(() => {
    async function fetchStore() {
      if (!sellerSlug) { setError("Invalid store link."); setLoading(false); return; }
      try {
        const r = await api.get<{ seller: Seller; products: Product[] }>(`/products/public/${sellerSlug}`);
        setSeller(r.data.seller);
        setProducts(r.data.products);
      } catch { setError("Seller store unavailable."); }
      finally { setLoading(false); }
    }
    void fetchStore();
  }, [sellerSlug]);

  // Derived: category list
  const categoryTabs = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    return ["All", ...cats];
  }, [products]);

  // Filtered + sorted products for discovery UX
  const visibleProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      if (activeCategory !== "All" && p.category !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const text = `${p.title} ${p.description || ""} ${p.category || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (maxPriceFilter !== null) {
        const unit = getProductUnitPricing(p, {});
        if (unit.price > maxPriceFilter) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const unitA = getProductUnitPricing(a, {});
      const unitB = getProductUnitPricing(b, {});
      if (sortBy === "price_low") return unitA.price - unitB.price;
      if (sortBy === "price_high") return unitB.price - unitA.price;
      if (sortBy === "discount") {
        const dA = unitA.mrp > unitA.price ? ((unitA.mrp - unitA.price) / unitA.mrp) * 100 : 0;
        const dB = unitB.mrp > unitB.price ? ((unitB.mrp - unitB.price) / unitB.mrp) * 100 : 0;
        return dB - dA;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [activeCategory, maxPriceFilter, products, searchQuery, sortBy]);

  // Selected products from cart
  const selectedItems = useMemo(() =>
    products.filter(p => (cart[p._id]?.quantity || 0) > 0),
    [products, cart]
  );

  const itemsTotal = useMemo(() =>
    selectedItems.reduce((s, p) => {
      const quantity = cart[p._id]?.quantity || 1;
      const unit = getProductUnitPricing(p, cart[p._id]?.variants || {});
      return s + unit.price * quantity;
    }, 0),
    [cart, selectedItems]
  );

  const deliveryCharge = useMemo(() => {
    if (!seller) return 0;
    if (seller.deliveryMode !== "flat_rate") return 0;

    const threshold = seller.freeDeliveryThreshold ?? 500;
    if (threshold > 0 && itemsTotal >= threshold) return 0;

    return seller.defaultDeliveryCharge ?? 0;
  }, [itemsTotal, seller]);

  const grandTotal = itemsTotal + deliveryCharge;
  const isPrepaidCheckout = paymentMethod === "prepaid";
  const isCodCheckout = paymentMethod === "cod";
  const supportsPrepaid = seller?.paymentMode === "prepaid_only" || seller?.paymentMode === "both";
  const supportsCod = seller?.paymentMode === "cod_only" || seller?.paymentMode === "both";

  const previewUpiLink = useMemo(() => {
    if (!seller?.upiId || grandTotal <= 0 || !isPrepaidCheckout) return "";
    return buildUpiLink(
      seller.upiId,
      seller.businessName,
      grandTotal,
      createTransactionRef(),
    );
  }, [grandTotal, isPrepaidCheckout, seller]);

  const activeUpiLink = paymentSession?.upiLink || previewUpiLink;
  const activeAmount = paymentSession?.amount ?? grandTotal;
  const placedOrderIds = paymentSession?.orderIds || [];
  const thankYouPath = useMemo(() => {
    if (!paymentSession) return "";
    const params = new URLSearchParams({
      sellerSlug: paymentSession.sellerSlug,
      orderIds: paymentSession.orderIds.join(","),
    });
    return `/thank-you?${params.toString()}`;
  }, [paymentSession]);
  const policyMeta: Record<PolicyKey, { title: string; content: string }> = useMemo(() => ({
    privacyPolicy: {
      title: "Privacy Policy",
      content: seller?.privacyPolicy || DEFAULT_POLICY_CONTENT.privacyPolicy,
    },
    returnRefundPolicy: {
      title: "Return & Refund Policy",
      content: seller?.returnRefundPolicy || DEFAULT_POLICY_CONTENT.returnRefundPolicy,
    },
    termsAndConditions: {
      title: "Terms & Conditions",
      content: seller?.termsAndConditions || DEFAULT_POLICY_CONTENT.termsAndConditions,
    },
  }), [seller]);

  useEffect(() => {
    if (!seller) return;

    if (seller.paymentMode === "cod_only") {
      setPaymentMethod("cod");
      return;
    }

    setPaymentMethod("prepaid");
  }, [seller]);

  function getItem(productId: string): CartItem {
    return cart[productId] || { quantity: 0, variants: {} };
  }

  function addProduct(productId: string) {
    setCart(prev => {
      if (prev[productId]?.quantity) return prev;
      const product = products.find((p) => p._id === productId);
      if (!product) return prev;

      const currentItem = prev[productId] || { quantity: 0, variants: {} };
      const variants = withAutoSelectedSingleVariants(product, currentItem.variants);
      const requiresVariantSelection = (product.variants || []).some(v => (v.options || []).length > 0);
      const hasSelection = hasCompleteVariantSelection(product, variants);

      if (requiresVariantSelection && !hasSelection) {
        setVariantErrorProductId(productId);
        setCartFeedback("Please select a variant");
        window.setTimeout(() => setCartFeedback(""), 1800);
        return prev;
      }

      setVariantErrorProductId(null);
      if (product) {
        setCartFeedback(`${product.title} added to cart`);
        window.setTimeout(() => setCartFeedback(""), 1800);
      }
      return { ...prev, [productId]: { quantity: 1, variants } };
    });
  }

  function removeProduct(productId: string) {
    setCart(prev => { const n = { ...prev }; delete n[productId]; return n; });
  }

  function setQty(productId: string, q: number) {
    if (q <= 0) { removeProduct(productId); return; }
    const product = products.find(p => p._id === productId);
    if (!product) return;
    const item = getItem(productId);
    const availableStock = getProductAvailableStock(product, item.variants);
    const safeQty = availableStock !== null ? Math.min(q, availableStock) : q;
    setCart(prev => ({ ...prev, [productId]: { ...getItem(productId), quantity: Math.max(1, safeQty) } }));
  }

  function setVariant(productId: string, label: string, value: string) {
    setVariantErrorProductId((prev) => (prev === productId ? null : prev));
    setCart(prev => ({
      ...prev,
      [productId]: { ...getItem(productId), variants: { ...getItem(productId).variants, [label]: value } },
    }));
  }

  function openUpiIntent(link: string) {
    window.location.href = link;
  }

  const checkPaymentStatus = useCallback(async () => {
    if (!paymentSession || !sellerSlug) return false;

    setCheckingPayment(true);

    try {
      const response = await api.get<{ orders: PublicOrderStatus[] }>("/orders/public/status", {
        params: {
          ids: paymentSession.orderIds.join(","),
          sellerSlug,
        },
      });

      const nextStatuses = response.data.orders.reduce<Record<string, OrderStatus>>((acc, order) => {
        acc[order._id] = order.paymentStatus;
        return acc;
      }, {});

      setOrderStatuses(nextStatuses);

      const allPaid =
        response.data.orders.length === paymentSession.orderIds.length &&
        response.data.orders.every(order => PAYMENT_SUCCESS_STATUSES.includes(order.paymentStatus));

      if (allPaid) {
        localStorage.removeItem(UPI_SESSION_STORAGE_KEY);
        navigate(thankYouPath, { replace: true });
        return true;
      }
    } catch {
      setIntentFeedback("We could not refresh payment status right now. Please try again.");
    } finally {
      setCheckingPayment(false);
    }

    return false;
  }, [navigate, paymentSession, sellerSlug, thankYouPath]);

  useEffect(() => {
    if (!sellerSlug || paymentSession) return;

    const rawSession = localStorage.getItem(UPI_SESSION_STORAGE_KEY);
    if (!rawSession) return;

    try {
      const parsed = JSON.parse(rawSession) as PaymentSession;
      if (parsed.sellerSlug === sellerSlug && parsed.orderIds.length > 0) {
        setPaymentSession(parsed);
      }
    } catch {
      localStorage.removeItem(UPI_SESSION_STORAGE_KEY);
    }
  }, [paymentSession, sellerSlug]);

  useEffect(() => {
    if (!paymentSession) return;
    localStorage.setItem(UPI_SESSION_STORAGE_KEY, JSON.stringify(paymentSession));
  }, [paymentSession]);

  useEffect(() => {
    if (!paymentSession) return;

    void checkPaymentStatus();
    const poller = window.setInterval(() => {
      void checkPaymentStatus();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkPaymentStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(poller);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkPaymentStatus, paymentSession]);

  // ── Place order
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setSuccessMessage("");
    if (selectedItems.length === 0) { setError("Select at least one product."); return; }
    if (!sellerSlug) { setError("Store link is invalid."); return; }
    if (!seller) { setError("Seller store unavailable."); return; }
    if (isPrepaidCheckout && !seller.upiId) { setError("UPI is not configured for this store."); return; }

    for (const product of selectedItems) {
      const item = cart[product._id];
      for (const variant of getNormalizedVariantGroups(product)) {
        if (!variant.options?.length) continue;
        if (!item?.variants?.[variant.label]) {
          setError(`Please select ${variant.label} for ${product.title}.`);
          return;
        }
      }
      const selectedStock = getProductAvailableStock(product, item?.variants || {});
      if (selectedStock !== null && item.quantity > selectedStock) {
        setError(`Only ${selectedStock} quantity left for selected options in ${product.title}.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const reqs = selectedItems.map(p =>
        api.post<{ order: { _id: string } }>("/orders", {
          productId: p._id,
          quantity: cart[p._id]?.quantity || 1,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          deliveryCharge,
          selectedVariants: cart[p._id]?.variants || {},
          note: note.trim(),
          paymentMethod,
        })
      );
      const results = await Promise.allSettled(reqs);
      const ids = results.filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<{ data: { order: { _id: string } } }>).value.data.order._id);
      if (ids.length === 0) { setError("Could not place order. Please retry."); }
      else {
        if (isCodCheckout) {
          localStorage.removeItem(UPI_SESSION_STORAGE_KEY);
          setPaymentSession(null);
          setOrderStatuses({});
          setSuccessMessage(`Order placed successfully for ${ids.length} item(s). The seller will collect payment on delivery.`);
          setProofSuccess("");
          setIntentFeedback("");
          setCustomerName(""); setCustomerPhone(""); setDeliveryAddress(""); setNote(""); setCart({});
          return;
        }

        const transactionRef = createTransactionRef();
        const nextSession: PaymentSession = {
          orderIds: ids,
          amount: grandTotal,
          transactionRef,
          upiLink: buildUpiLink(seller.upiId, seller.businessName, grandTotal, transactionRef),
          sellerSlug,
        };

        setPaymentSession(nextSession);
        setOrderStatuses(ids.reduce<Record<string, OrderStatus>>((acc, id) => {
          acc[id] = "pending";
          return acc;
        }, {}));
        setSuccessMessage(`Order placed for ${ids.length} item(s). Complete the payment in your UPI app and we will redirect you once the payment is marked successful.`);
        setProofSuccess("");
        setIntentFeedback("Opening your UPI app. If it does not open, use the button below.");
        setCustomerName(""); setCustomerPhone(""); setDeliveryAddress(""); setNote(""); setCart({});
        window.setTimeout(() => openUpiIntent(nextSession.upiLink), 200);
      }
    } catch { setError("Could not submit order."); }
    finally { setSubmitting(false); }
  }

  // ── Submit payment proof
  async function handleProofSubmit() {
    if (!screenshotUrl.trim() || placedOrderIds.length === 0) return;
    setUploadingProof(true);
    try {
      await Promise.all(placedOrderIds.map(id =>
        api.patch(`/orders/${id}/payment-screenshot`, { paymentScreenshotUrl: screenshotUrl.trim() })
      ));
      setProofSuccess("Payment proof submitted! The seller will confirm your order shortly.");
      setScreenshotUrl("");
    } catch { setError("Could not submit proof."); }
    finally { setUploadingProof(false); }
  }

  async function copyIntentLink() {
    if (!activeUpiLink) return;
    await navigator.clipboard.writeText(activeUpiLink);
    setIntentFeedback("UPI intent link copied.");
    window.setTimeout(() => setIntentFeedback(""), 2200);
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8">
        <div className="mb-6 h-24 animate-pulse rounded-3xl bg-slate-200/80 dark:bg-slate-800/80" />
        <div className="mb-4 h-16 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
        <div className="grid gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="h-36 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
              <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-4 h-10 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (!seller) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-10">
        <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-card">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-teal-600">🛍️ MyDukan</p>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Store Not Found</h1>
          <p className="mt-2 text-sm text-slate-600">{error || "This seller link is unavailable."}</p>
          <Link to="/login" className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign In to MyDukan</Link>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-3 py-5 sm:px-4 sm:py-8 lg:grid-cols-3">

      {/* ── LEFT: Store + Products ─────────────────────────── */}
      <section className="space-y-5 lg:col-span-2">
        {/* Store Header */}
        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-4">
            {seller.businessLogo && (
              <img src={seller.businessLogo} alt="logo" className="h-16 w-16 rounded-2xl object-contain border border-slate-200" />
            )}
            <div>
              <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-0.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">🛍️ MyDukan</p>
              <h1 className="mt-1 font-heading text-2xl font-bold text-slate-900 sm:text-3xl">{seller.businessName}</h1>
              {seller.businessAddress && <p className="text-xs text-slate-500 mt-0.5">📍 {seller.businessAddress}</p>}
            </div>
          </div>

          {/* Social + action buttons row */}
          <div className="mt-4 flex flex-wrap gap-2">
            {seller.whatsappNumber && (
              <a href={`https://wa.me/${seller.whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition">
                💬 WhatsApp
              </a>
            )}
            {seller.callNumber && (
              <a href={`tel:${seller.callNumber}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition">
                📞 Call Us
              </a>
            )}
            {seller.socialLinks?.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 transition">
                {SOCIAL_ICONS[s.platform] || "🔗"} {s.platform}
              </a>
            ))}
          </div>
        </div>

        {/* Banners */}
        {seller.banners?.length > 0 && (
          <BannerCarousel banners={seller.banners} />
        )}

        {/* Discovery controls */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, categories..."
              className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={() => setShowMobileFilters((prev) => !prev)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 md:hidden"
            >
              {showMobileFilters ? "Hide Filters" : "Show Filters"}
            </button>
          </div>

          <div className={`mt-3 grid gap-2 ${showMobileFilters ? "grid" : "hidden"} md:grid md:grid-cols-3`}>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "latest" | "price_low" | "price_high" | "discount")}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="latest">Sort: Latest</option>
              <option value="price_low">Sort: Price low to high</option>
              <option value="price_high">Sort: Price high to low</option>
              <option value="discount">Sort: Best discount</option>
            </select>
            <select
              value={maxPriceFilter ?? ""}
              onChange={(e) => setMaxPriceFilter(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">All prices</option>
              <option value="100">Under ₹100</option>
              <option value="250">Under ₹250</option>
              <option value="500">Under ₹500</option>
              <option value="1000">Under ₹1000</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setMaxPriceFilter(null);
                setSortBy("latest");
                setActiveCategory("All");
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              Reset
            </button>
          </div>

          {/* Category Tabs */}
          {categoryTabs.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {categoryTabs.map(c => (
                <button key={c} onClick={() => setActiveCategory(c)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${activeCategory === c ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {cartFeedback && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {cartFeedback}
          </p>
        )}

        {/* Products */}
        {visibleProducts.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-amber-700">No products match your filters.</p>
            <p className="mt-1 text-xs text-amber-600">Try clearing search or selecting a different category.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map(product => {
              const item = getItem(product._id);
              const isSelected = item.quantity > 0;
              const unit = getProductUnitPricing(product, item.variants);
              const unitPrice = unit.price;
              const unitMrp = unit.mrp;
              const normalizedVariants = getNormalizedVariantGroups(product);
              const selectedStock = getProductAvailableStock(product, item.variants);
              const effectiveVariants = withAutoSelectedSingleVariants(product, item.variants);
              const requiresVariantSelection = normalizedVariants.some(v => (v.options || []).length > 0);
              const hasVariantSelection = hasCompleteVariantSelection(product, effectiveVariants);
              const discountPercent =
                unitMrp > unitPrice
                  ? Math.round(((unitMrp - unitPrice) / unitMrp) * 100)
                  : 0;
              const isOutOfStock = selectedStock !== null && selectedStock <= 0;
              const isNewProduct = Date.now() - new Date(product.createdAt).getTime() < 1000 * 60 * 60 * 24 * 7;

              return (
                <article key={product._id}
                  className={`group overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 ${isSelected ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}>
                  <div className="relative">
                    {product.imageUrl ? (
                      <img src={normalizeImageUrl(product.imageUrl)} alt={product.title} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800" />
                    )}
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      {isNewProduct && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">NEW</span>}
                      {discountPercent > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{discountPercent}% OFF</span>}
                      {isOutOfStock && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">OUT OF STOCK</span>}
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    {product.category && (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{product.category}</span>
                    )}
                    <p className="line-clamp-2 text-lg font-bold leading-tight text-slate-900 dark:text-slate-100">{product.title}</p>
                    <div className="flex items-end gap-2">
                      <span className="text-xl font-bold text-slate-900 dark:text-slate-100">₹{unitPrice}</span>
                      {unitMrp > 0 && unitMrp > unitPrice && (
                        <span className="text-sm font-medium text-slate-400 line-through">₹{unitMrp}</span>
                      )}
                    </div>
                    {product.description && (expandedProductId === product._id) && (
                      <p className="text-sm text-slate-600 dark:text-slate-300">{product.description}</p>
                    )}
                    {(product.description || product.notes) && (
                      <button
                        type="button"
                        onClick={() => setExpandedProductId((prev) => (prev === product._id ? null : product._id))}
                        className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
                      >
                        {expandedProductId === product._id ? "Hide details" : "View details"}
                      </button>
                    )}
                    {product.notes && expandedProductId === product._id && <p className="text-xs text-slate-500 italic dark:text-slate-400">{product.notes}</p>}

                    {/* Variants / units */}
                    {normalizedVariants.length > 0 && (
                      <div className={`space-y-2 rounded-xl p-2 ${variantErrorProductId === product._id ? "border border-rose-300 bg-rose-50/60 dark:bg-rose-950/30" : ""}`}>
                        {normalizedVariants.map(v => (
                          <div key={v.label}>
                            <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Select {v.label}</p>
                            <div className="flex flex-wrap gap-2">
                              {v.options.map(opt => {
                                const optionPrice = product.variantPrices?.[getVariantPriceKey(v.label, opt)];
                                const optionMrp = product.variantMrps?.[getVariantPriceKey(v.label, opt)];
                                const optionQty = product.variantQuantities?.[getVariantPriceKey(v.label, opt)];
                                const optionOut = optionQty !== undefined && optionQty <= 0;
                                return (
                                <button key={opt} type="button"
                                  disabled={optionOut}
                                  onClick={() => setVariant(product._id, v.label, opt)}
                                  className={`min-w-28 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${item.variants[v.label] === opt ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
                                  <span className="block">{opt}</span>
                                  {optionPrice ? (
                                    <span className="block text-xs font-bold">
                                      ₹{optionPrice}
                                      {optionMrp && optionMrp > optionPrice ? ` · MRP ₹${optionMrp}` : ""}
                                    </span>
                                  ) : null}
                                  {optionQty !== undefined ? <span className="block text-[11px] font-medium text-slate-500">{optionQty > 0 ? `${optionQty} left` : "Out of stock"}</span> : null}
                                </button>
                              );})}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add to cart / qty controls */}
                    {!isSelected ? (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/80">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Unit</p>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                            {(product.variants || []).length > 0
                              ? Object.values(effectiveVariants).join(" • ") || "Choose options"
                              : "Default"}
                          </p>
                          {requiresVariantSelection && !hasVariantSelection && (
                            <p className="mt-0.5 text-xs font-semibold text-rose-600">Please select a variant</p>
                          )}
                        </div>
                        <button type="button" onClick={() => addProduct(product._id)}
                          disabled={isOutOfStock || (requiresVariantSelection && !hasVariantSelection)}
                          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50">
                          Add to cart
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
                        <button type="button" onClick={() => setQty(product._id, item.quantity - 1)}
                          className="h-9 w-9 rounded-lg border border-emerald-200 bg-white text-lg font-bold text-slate-700">−</button>
                        <input type="number" min={1}
                          className="h-9 w-16 rounded-lg border border-emerald-200 bg-white text-center text-sm font-semibold outline-none"
                          value={item.quantity}
                          onChange={e => setQty(product._id, Number(e.target.value))} />
                        <button type="button" onClick={() => setQty(product._id, item.quantity + 1)}
                          className="h-9 w-9 rounded-lg border border-emerald-200 bg-white text-lg font-bold text-slate-700">+</button>
                        <span className="ml-auto text-sm font-bold text-slate-900 dark:text-slate-100">₹{item.quantity * unitPrice}</span>
                        <button onClick={() => removeProduct(product._id)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Remove</button>
                      </div>
                    )}
                    {selectedStock !== null && (
                      <p className="text-xs text-slate-500">Available quantity for selected options: {selectedStock}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── RIGHT: Checkout ────────────────────────────────── */}
      <section className="space-y-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card sm:p-6 lg:sticky lg:top-6 lg:self-start">
        <h2 className="font-heading text-2xl font-bold text-slate-900">{t("store.checkout", "Checkout")}</h2>

        {/* Order summary */}
        {selectedItems.length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Add one or more products to cart.</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Order Summary</p>
            {selectedItems.map(p => (
              <div key={p._id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                <span className="max-w-[65%] break-words">{p.title} × {cart[p._id]?.quantity}</span>
                <span className="font-semibold text-slate-900">₹{getProductUnitPricing(p, cart[p._id]?.variants || {}).price * (cart[p._id]?.quantity || 1)}</span>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-2 space-y-1">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Items total</span><span>₹{itemsTotal}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>
                  {seller?.deliveryMode === "flat_rate"
                    ? `Delivery charge${seller.freeDeliveryThreshold > 0 ? ` (Free above ₹${seller.freeDeliveryThreshold})` : ""}`
                    : "Delivery charge"}
                </span>
                <span className="font-semibold text-slate-800">
                  {deliveryCharge === 0 ? "Free" : `₹${deliveryCharge}`}
                </span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200 text-sm">
                <span>Total Payable</span><span>₹{grandTotal}</span>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Customer Details</p>
          <p className="text-sm text-slate-600">Fill your details and choose how you want to pay before placing the order.</p>
        </div>

        {(supportsPrepaid || supportsCod) && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Payment method</p>
            <div className="grid gap-2">
              {supportsPrepaid && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("prepaid")}
                  className={`rounded-xl border px-4 py-3 text-left transition ${isPrepaidCheckout ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
                >
                  <p className="text-sm font-semibold text-slate-900">Pay Before Order</p>
                  <p className="text-xs text-slate-500">Pay now using UPI and continue automatically after payment.</p>
                </button>
              )}
              {supportsCod && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cod")}
                  className={`rounded-xl border px-4 py-3 text-left transition ${isCodCheckout ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
                >
                  <p className="text-sm font-semibold text-slate-900">Cash on Delivery</p>
                  <p className="text-xs text-slate-500">Place the order now and pay the seller at the time of delivery.</p>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Order form */}
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">Your name *</span>
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              value={customerName} onChange={e => setCustomerName(e.target.value)} required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">Phone number *</span>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10,15}"
              maxLength={15}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">Delivery address</span>
            <textarea className="min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              placeholder="Full address for delivery" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">Note (optional)</span>
            <textarea className="min-h-12 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              placeholder="Special instructions..." value={note} onChange={e => setNote(e.target.value)} />
          </label>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {successMessage && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>}

          <button type="submit" disabled={submitting || selectedItems.length === 0}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400">
            {submitting ? "Submitting..." : "Save details"}
          </button>
        </form>
        </div>

        {/* UPI payment */}
        {(supportsPrepaid && isPrepaidCheckout && seller.upiId && activeAmount > 0 && (selectedItems.length > 0 || Boolean(paymentSession))) && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 2: UPI Payment</p>
              <p className="text-sm text-slate-600">After placing the order, pay the exact amount below using any UPI app.</p>
            </div>
            <p className="text-sm text-slate-700">UPI: <span className="font-semibold text-slate-900">{seller.upiId}</span></p>
            {paymentSession && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <p className="font-semibold">Transaction Ref: {paymentSession.transactionRef}</p>
                <p className="mt-1">This page is checking your order status every few seconds and will move to the thank you page automatically after payment confirmation.</p>
              </div>
            )}
            <div className="inline-flex rounded-xl bg-white p-3">
              <QRCodeSVG value={activeUpiLink} size={128} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => openUpiIntent(activeUpiLink)}
                className="flex-1 rounded-xl bg-teal-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-teal-500 transition">
                Pay ₹{activeAmount} via UPI
              </button>
              <button type="button" onClick={copyIntentLink}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 transition">
                Copy Link
              </button>
            </div>
            {paymentSession && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void checkPaymentStatus()}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  {checkingPayment ? "Checking..." : "Already paid? Check status"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(thankYouPath)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Open Thank You Page
                </button>
              </div>
            )}
            {paymentSession && placedOrderIds.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                {placedOrderIds.map(id => (
                  <div key={id} className="flex items-center justify-between gap-3 py-1">
                    <span className="truncate">{id}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-semibold capitalize text-slate-700">
                      {orderStatuses[id] || "pending"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {intentFeedback && <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">{intentFeedback}</p>}
            <p className="text-xs text-slate-400">
              {paymentSession
                ? "If your UPI app does not return automatically, come back to this tab or use the Thank You page button."
                : "Scan QR or tap Pay button on mobile with a UPI app."}
            </p>
          </div>
        )}
        {supportsCod && isCodCheckout && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Payment on Delivery</p>
            <p className="text-sm text-emerald-900">No online payment is needed now. Your order will be placed first and the seller can collect payment at delivery.</p>
          </div>
        )}
        {/* Payment proof upload — shown after order placed */}
        {isPrepaidCheckout && placedOrderIds.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">📸 Share Payment Screenshot</p>
            <p className="text-xs text-amber-700">Paste the URL of your payment screenshot so the seller can confirm your order.</p>
            <input className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              placeholder="https://drive.google.com/..." value={screenshotUrl} onChange={e => setScreenshotUrl(e.target.value)} />
            {proofSuccess && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">{proofSuccess}</p>}
            <button type="button" onClick={handleProofSubmit} disabled={uploadingProof || !screenshotUrl.trim()}
              className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:bg-amber-300 transition">
              {uploadingProof ? "Submitting..." : "Submit Payment Proof"}
            </button>
          </div>
        )}
      </section>
    </main>
    <footer className="space-y-3 py-4 text-center text-xs text-slate-400">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => setActivePolicy("privacyPolicy")} className="font-semibold text-slate-500 hover:text-slate-700">
          Privacy Policy
        </button>
        <button type="button" onClick={() => setActivePolicy("returnRefundPolicy")} className="font-semibold text-slate-500 hover:text-slate-700">
          Return & Refund Policy
        </button>
        <button type="button" onClick={() => setActivePolicy("termsAndConditions")} className="font-semibold text-slate-500 hover:text-slate-700">
          Terms & Conditions
        </button>
      </div>
      <p>
        Powered by <span className="font-semibold text-slate-500">🛍️ MyDukan</span>
      </p>
    </footer>
    {activePolicy && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
        <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Store Policy</p>
              <h3 className="mt-1 font-heading text-xl font-bold text-slate-900">{policyMeta[activePolicy].title}</h3>
            </div>
            <button
              type="button"
              onClick={() => setActivePolicy(null)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(85vh-88px)] overflow-y-auto px-5 py-4">
            <div className="whitespace-pre-line text-sm leading-6 text-slate-700">
              {policyMeta[activePolicy].content}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
