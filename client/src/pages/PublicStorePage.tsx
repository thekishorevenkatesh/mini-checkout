import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api/client";
import type { Product, Seller } from "../types";

type CartMap = Record<string, number>;

function buildUpiLink(
  upiId: string,
  businessName: string,
  amount: number,
  reference: string
) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: businessName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: reference,
  });

  return `upi://pay?${params.toString()}`;
}

export function PublicStorePage() {
  const { sellerSlug } = useParams<{ sellerSlug: string }>();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [intentFeedback, setIntentFeedback] = useState("");

  useEffect(() => {
    async function fetchStore() {
      if (!sellerSlug) {
        setError("Seller slug is missing.");
        setLoading(false);
        return;
      }

      try {
        const response = await api.get<{ seller: Seller; products: Product[] }>(
          `/products/public/${sellerSlug}`
        );
        setSeller(response.data.seller);
        setProducts(response.data.products);
      } catch {
        setError("Seller store unavailable.");
      } finally {
        setLoading(false);
      }
    }

    void fetchStore();
  }, [sellerSlug]);

  const selectedProducts = useMemo(
    () => products.filter((product) => (cart[product._id] || 0) > 0),
    [products, cart]
  );

  const payableAmount = useMemo(
    () =>
      selectedProducts.reduce(
        (sum, product) => sum + product.price * (cart[product._id] || 1),
        0
      ),
    [cart, selectedProducts]
  );

  const upiLink = useMemo(() => {
    if (!seller?.upiId || payableAmount <= 0) {
      return "";
    }

    return buildUpiLink(
      seller.upiId,
      seller.businessName,
      payableAmount,
      `Store Order (${selectedProducts.length} items)`
    );
  }, [payableAmount, selectedProducts.length, seller]);

  async function copyIntentLink() {
    if (!upiLink) {
      return;
    }

    await navigator.clipboard.writeText(upiLink);
    setIntentFeedback("UPI intent link copied.");
    window.setTimeout(() => setIntentFeedback(""), 2200);
  }

  function addProduct(productId: string) {
    setCart((current) => {
      if (current[productId]) {
        return current;
      }

      return {
        ...current,
        [productId]: 1,
      };
    });
  }

  function removeProduct(productId: string) {
    setCart((current) => {
      if (!current[productId]) {
        return current;
      }

      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  function setProductQuantity(productId: string, quantity: number) {
    const safeQuantity = Number.isInteger(quantity) ? quantity : 1;

    if (safeQuantity <= 0) {
      removeProduct(productId);
      return;
    }

    setCart((current) => ({
      ...current,
      [productId]: safeQuantity,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (selectedProducts.length === 0) {
      setError("Select at least one product to checkout.");
      return;
    }

    setSubmitting(true);

    try {
      const requests = selectedProducts.map((product) =>
        api.post<{ order: { _id: string } }>("/orders", {
          productId: product._id,
          quantity: cart[product._id] || 1,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          note: note.trim(),
        })
      );

      const results = await Promise.allSettled(requests);
      const successIds = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value.data.order._id);

      if (successIds.length === 0) {
        setError("Could not submit order. Please retry.");
      } else if (successIds.length < requests.length) {
        setSuccessMessage(
          `Created ${successIds.length} order(s). Some items failed, please retry remaining.`
        );
      } else {
        setSuccessMessage(
          `Order placed successfully for ${successIds.length} item(s).`
        );
        setCustomerName("");
        setCustomerPhone("");
        setNote("");
        setCart({});
      }
    } catch {
      setError("Could not submit order. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
        <p className="rounded-full border border-white/80 bg-white/90 px-5 py-2 text-sm font-semibold text-slate-700 shadow-card">
          Loading store...
        </p>
      </main>
    );
  }

  if (!seller) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-10">
        <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-card">
          <h1 className="font-heading text-2xl font-bold text-slate-900">
            Store Not Found
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {error || "This seller link is unavailable."}
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Seller Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-3 py-5 sm:px-4 sm:py-10 lg:grid-cols-3">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card sm:p-8 lg:col-span-2">
        <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
          Seller Store
        </p>
        <h1 className="mt-4 font-heading text-2xl font-bold text-slate-900 sm:text-3xl">
          {seller.businessName}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Select multiple products, set quantity for each, then checkout once.
        </p>

        {products.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No products are available right now.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {products.map((product) => {
              const quantity = cart[product._id] || 0;
              const isSelected = quantity > 0;

              return (
                <article
                  key={product._id}
                  className={`rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-teal-400 bg-teal-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="h-32 w-full rounded-xl object-cover"
                    />
                  ) : null}
                  <p className="mt-3 font-semibold text-slate-800">{product.title}</p>
                  <p className="mt-1 text-sm text-slate-600">Rs {product.price}</p>
                  {product.description ? (
                    <p className="mt-2 text-xs text-slate-600">
                      {product.description}
                    </p>
                  ) : null}

                  {!isSelected ? (
                    <button
                      type="button"
                      className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                      onClick={() => addProduct(product._id)}
                    >
                      Add To Cart
                    </button>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Quantity
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                          onClick={() => removeProduct(product._id)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700"
                          onClick={() =>
                            setProductQuantity(product._id, quantity - 1)
                          }
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          className="h-8 w-16 rounded-md border border-slate-200 text-center text-base outline-none focus:border-slate-400 sm:text-sm"
                          value={quantity}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            setProductQuantity(
                              product._id,
                              Number.isInteger(parsed) ? parsed : 1
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700"
                          onClick={() =>
                            setProductQuantity(product._id, quantity + 1)
                          }
                        >
                          +
                        </button>
                        <span className="w-full text-right text-xs font-semibold text-slate-700 sm:ml-auto sm:w-auto">
                          Rs {quantity * product.price}
                        </span>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card sm:p-8 lg:sticky lg:top-6 lg:self-start">
        <h2 className="font-heading text-2xl font-bold text-slate-900">
          Checkout
        </h2>

        {selectedProducts.length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Add one or more products to cart.
          </p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Order Summary
            </p>
            <div className="mt-2 space-y-2">
              {selectedProducts.map((product) => (
                <div
                  key={product._id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700"
                >
                  <span className="max-w-[72%] break-words">
                    {product.title} x {cart[product._id]}
                  </span>
                  <span className="font-semibold text-slate-900">
                    Rs {product.price * (cart[product._id] || 1)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
              <p className="flex items-center justify-between font-semibold text-slate-900">
                <span>Total payable</span>
                <span>Rs {payableAmount}</span>
              </p>
            </div>
          </div>
        )}

        {seller.upiId && payableAmount > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              UPI ID:{" "}
              <span className="font-semibold text-slate-900">{seller.upiId}</span>
            </p>
            <div className="mt-3 inline-flex rounded-xl bg-white p-3">
              <QRCodeSVG value={upiLink} size={132} />
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href={upiLink}
                className="rounded-xl bg-teal-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-teal-500"
              >
                Pay Rs {payableAmount} via UPI Intent
              </a>
              <button
                type="button"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                onClick={copyIntentLink}
              >
                Copy Intent Link
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              UPI intent works best on mobile devices with UPI apps installed.
            </p>
            {intentFeedback ? (
              <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-700">
                {intentFeedback}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Add products to cart to generate payment QR.
          </p>
        )}

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">
              Your name
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">
              Phone number
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">
              Note (optional)
            </span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
              placeholder="Delivery notes or special instructions"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || selectedProducts.length === 0}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400"
          >
            {submitting ? "Submitting..." : "I Have Paid & Place Order"}
          </button>
        </form>
      </section>
    </main>
  );
}
