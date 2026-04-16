import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api/client";
import type { Product, Seller } from "../types";

type CartItem = { quantity: number; variants: Record<string, string> };
type CartMap = Record<string, CartItem>;

const SOCIAL_ICONS: Record<string, string> = {
  Instagram: "📸", Facebook: "👥", "Twitter/X": "🐦",
  YouTube: "▶️", LinkedIn: "💼", Website: "🌐", Other: "🔗",
};

function buildUpiLink(upiId: string, businessName: string, amount: number, ref: string) {
  const params = new URLSearchParams({ pa: upiId, pn: businessName, am: amount.toFixed(2), cu: "INR", tn: ref });
  return `upi://pay?${params.toString()}`;
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
      <img src={banners[idx].imageUrl} alt={banners[idx].title || "Banner"} className="w-full h-48 object-cover sm:h-64" />
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
  const { sellerSlug } = useParams<{ sellerSlug: string }>();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  // Checkout fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [placedOrderIds, setPlacedOrderIds] = useState<string[]>([]);

  // Payment proof
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofSuccess, setProofSuccess] = useState("");

  const [intentFeedback, setIntentFeedback] = useState("");

  useEffect(() => {
    async function fetchStore() {
      if (!sellerSlug) { setError("Invalid store link."); setLoading(false); return; }
      try {
        const r = await api.get<{ seller: Seller; products: Product[] }>(`/products/public/${sellerSlug}`);
        setSeller(r.data.seller);
        setProducts(r.data.products);
        // Initialise delivery charge from seller's store setting
        setDeliveryCharge(r.data.seller.defaultDeliveryCharge ?? 0);
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

  // Filtered products
  const visibleProducts = useMemo(() =>
    activeCategory === "All" ? products : products.filter(p => p.category === activeCategory),
    [products, activeCategory]
  );

  // Selected products from cart
  const selectedItems = useMemo(() =>
    products.filter(p => (cart[p._id]?.quantity || 0) > 0),
    [products, cart]
  );

  const itemsTotal = useMemo(() =>
    selectedItems.reduce((s, p) => s + p.price * (cart[p._id]?.quantity || 1), 0),
    [cart, selectedItems]
  );

  const grandTotal = itemsTotal + deliveryCharge;

  const upiLink = useMemo(() => {
    if (!seller?.upiId || grandTotal <= 0) return "";
    return buildUpiLink(seller.upiId, seller.businessName, grandTotal, `Order (${selectedItems.length} item(s))`);
  }, [grandTotal, selectedItems.length, seller]);

  function getItem(productId: string): CartItem {
    return cart[productId] || { quantity: 0, variants: {} };
  }

  function addProduct(productId: string) {
    setCart(prev => {
      if (prev[productId]?.quantity) return prev;
      return { ...prev, [productId]: { quantity: 1, variants: {} } };
    });
  }

  function removeProduct(productId: string) {
    setCart(prev => { const n = { ...prev }; delete n[productId]; return n; });
  }

  function setQty(productId: string, q: number) {
    if (q <= 0) { removeProduct(productId); return; }
    setCart(prev => ({ ...prev, [productId]: { ...getItem(productId), quantity: q } }));
  }

  function setVariant(productId: string, label: string, value: string) {
    setCart(prev => ({
      ...prev,
      [productId]: { ...getItem(productId), variants: { ...getItem(productId).variants, [label]: value } },
    }));
  }

  // ── Place order
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setSuccessMessage("");
    if (selectedItems.length === 0) { setError("Select at least one product."); return; }
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
        })
      );
      const results = await Promise.allSettled(reqs);
      const ids = results.filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<{ data: { order: { _id: string } } }>).value.data.order._id);
      setPlacedOrderIds(ids);
      if (ids.length === 0) { setError("Could not place order. Please retry."); }
      else {
        setSuccessMessage(`Order placed for ${ids.length} item(s)! Please complete payment and share proof below.`);
        setCustomerName(""); setCustomerPhone(""); setDeliveryAddress(""); setNote(""); setCart({});
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
    if (!upiLink) return;
    await navigator.clipboard.writeText(upiLink);
    setIntentFeedback("UPI intent link copied.");
    window.setTimeout(() => setIntentFeedback(""), 2200);
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
        <p className="rounded-full border border-white/80 bg-white/90 px-5 py-2 text-sm font-semibold text-slate-700 shadow-card">Loading store...</p>
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

        {/* Category Tabs */}
        {categoryTabs.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {categoryTabs.map(c => (
              <button key={c} onClick={() => setActiveCategory(c)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${activeCategory === c ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Products */}
        {visibleProducts.length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">No products available right now.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleProducts.map(product => {
              const item = getItem(product._id);
              const isSelected = item.quantity > 0;
              return (
                <article key={product._id}
                  className={`rounded-2xl border p-4 transition ${isSelected ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white"}`}>
                  {product.imageUrl && (
                    <img src={product.imageUrl} alt={product.title} className="h-36 w-full rounded-xl object-cover" />
                  )}
                  {product.category && (
                    <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{product.category}</span>
                  )}
                  <p className="mt-2 font-semibold text-slate-800">{product.title}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-900">₹{product.price}</span>
                    {product.mrp > 0 && product.mrp > product.price && (
                      <span className="text-sm text-slate-400 line-through">₹{product.mrp}</span>
                    )}
                    {product.mrp > product.price && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                        {Math.round(((product.mrp - product.price) / product.mrp) * 100)}% off
                      </span>
                    )}
                  </div>
                  {product.description && <p className="mt-1 text-xs text-slate-600">{product.description}</p>}
                  {product.notes && <p className="mt-1 text-xs text-slate-500 italic">{product.notes}</p>}

                  {/* Variants */}
                  {isSelected && product.variants?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {product.variants.map(v => (
                        <div key={v.label}>
                          <p className="text-xs font-semibold text-slate-600 mb-1">{v.label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {v.options.map(opt => (
                              <button key={opt} type="button"
                                onClick={() => setVariant(product._id, v.label, opt)}
                                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${item.variants[v.label] === opt ? "border-teal-500 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add to cart / qty controls */}
                  {!isSelected ? (
                    <button type="button" onClick={() => addProduct(product._id)}
                      className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition">
                      Add to Cart
                    </button>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" onClick={() => setQty(product._id, item.quantity - 1)}
                        className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 font-bold text-slate-700">−</button>
                      <input type="number" min={1}
                        className="h-8 w-14 rounded-md border border-slate-200 text-center text-sm outline-none"
                        value={item.quantity}
                        onChange={e => setQty(product._id, Number(e.target.value))} />
                      <button type="button" onClick={() => setQty(product._id, item.quantity + 1)}
                        className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 font-bold text-slate-700">+</button>
                      <span className="ml-auto text-sm font-semibold text-slate-900">₹{item.quantity * product.price}</span>
                      <button onClick={() => removeProduct(product._id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Remove</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── RIGHT: Checkout ────────────────────────────────── */}
      <section className="space-y-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card sm:p-6 lg:sticky lg:top-6 lg:self-start">
        <h2 className="font-heading text-2xl font-bold text-slate-900">Checkout</h2>

        {/* Order summary */}
        {selectedItems.length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Add one or more products to cart.</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Order Summary</p>
            {selectedItems.map(p => (
              <div key={p._id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                <span className="max-w-[65%] break-words">{p.title} × {cart[p._id]?.quantity}</span>
                <span className="font-semibold text-slate-900">₹{p.price * (cart[p._id]?.quantity || 1)}</span>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-2 space-y-1">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Items total</span><span>₹{itemsTotal}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Delivery charge</span>
                <span className="font-semibold text-slate-800">₹{deliveryCharge}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200 text-sm">
                <span>Total Payable</span><span>₹{grandTotal}</span>
              </div>
            </div>
          </div>
        )}

        {/* UPI payment */}
        {seller.upiId && grandTotal > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm text-slate-700">UPI: <span className="font-semibold text-slate-900">{seller.upiId}</span></p>
            <div className="inline-flex rounded-xl bg-white p-3">
              <QRCodeSVG value={upiLink} size={128} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a href={upiLink}
                className="flex-1 rounded-xl bg-teal-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-teal-500 transition">
                Pay ₹{grandTotal} via UPI
              </a>
              <button type="button" onClick={copyIntentLink}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 transition">
                Copy Link
              </button>
            </div>
            {intentFeedback && <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">{intentFeedback}</p>}
            <p className="text-xs text-slate-400">Scan QR or tap Pay button on mobile with a UPI app.</p>
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
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required />
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
            {submitting ? "Submitting..." : "I Have Paid & Place Order"}
          </button>
        </form>

        {/* Payment proof upload — shown after order placed */}
        {placedOrderIds.length > 0 && (
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
    <footer className="py-4 text-center text-xs text-slate-400">
      Powered by <span className="font-semibold text-slate-500">🛍️ MyDukan</span>
    </footer>
    </>
  );
}
