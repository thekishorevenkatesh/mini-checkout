import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Order, OrderStatus, Product } from "../types";

type ProductForm = {
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  notes: string;
};

const initialProductForm: ProductForm = {
  title: "",
  description: "",
  price: "",
  imageUrl: "",
  notes: "",
};

const statusClasses: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-sky-100 text-sky-700 border-sky-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

export function DashboardPage() {
  const { seller, logout, updateProfile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>(initialProductForm);
  const [profileName, setProfileName] = useState(seller?.businessName || "");
  const [profileUpi, setProfileUpi] = useState(seller?.upiId || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");

  useEffect(() => {
    setProfileName(seller?.businessName || "");
    setProfileUpi(seller?.upiId || "");
  }, [seller]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [productsResponse, ordersResponse] = await Promise.all([
        api.get<{ products: Product[] }>("/products/my"),
        api.get<{ orders: Order[] }>("/orders/my"),
      ]);

      setProducts(productsResponse.data.products);
      setOrders(ordersResponse.data.orders);
    } catch {
      setError("Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((order) => order.paymentStatus === "pending");
    const confirmed = orders.filter(
      (order) => order.paymentStatus === "confirmed"
    );
    return {
      totalProducts: products.length,
      totalOrders: total,
      pendingPayments: pending.length,
      confirmed: confirmed.length,
    };
  }, [orders, products.length]);

  const storeUrl = useMemo(() => {
    if (!seller?.slug) {
      return "";
    }

    if (typeof window === "undefined") {
      return `/store/${seller.slug}`;
    }

    return `${window.location.origin}/store/${seller.slug}`;
  }, [seller?.slug]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setError("");

    try {
      await updateProfile({
        businessName: profileName.trim(),
        upiId: profileUpi.trim(),
      });
    } catch {
      setError("Could not update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingProduct(true);
    setError("");

    try {
      await api.post("/products", {
        title: productForm.title.trim(),
        description: productForm.description.trim(),
        price: Number(productForm.price),
        imageUrl: productForm.imageUrl.trim(),
        notes: productForm.notes.trim(),
      });

      setProductForm(initialProductForm);
      await loadData();
    } catch {
      setError("Could not create product. Please check the details.");
    } finally {
      setIsCreatingProduct(false);
    }
  }

  async function handleOrderStatusChange(orderId: string, status: OrderStatus) {
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      await loadData();
    } catch {
      setError("Could not update order status.");
    }
  }

  async function copyStoreLink() {
    if (!storeUrl) {
      setCopyFeedback("Store link is not ready yet. Please re-login once.");
      window.setTimeout(() => setCopyFeedback(""), 2500);
      return;
    }

    await navigator.clipboard.writeText(storeUrl);
    setCopyFeedback("Copied seller store link.");
    window.setTimeout(() => setCopyFeedback(""), 2000);
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-3 py-5 sm:px-4 sm:py-8">
      <header className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-card backdrop-blur sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
              Seller Dashboard
            </p>
            <h1 className="mt-2 font-heading text-2xl font-bold text-slate-900 sm:text-3xl">
              {seller?.businessName || "Vendor Workspace"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Add products, share one store link, and track customer orders.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2 lg:flex">
            <a
              href={storeUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className={`rounded-xl px-4 py-2 text-center text-sm font-semibold transition ${
                storeUrl
                  ? "bg-slate-900 text-white hover:bg-slate-700"
                  : "pointer-events-none bg-slate-300 text-slate-500"
              }`}
            >
              Open Store
            </a>
            <button
              type="button"
              disabled={!storeUrl}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition sm:col-span-1 ${
                storeUrl
                  ? "bg-teal-600 text-white hover:bg-teal-500"
                  : "cursor-not-allowed bg-slate-300 text-slate-500"
              }`}
              onClick={copyStoreLink}
            >
              Copy Store Link
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 sm:col-span-2 lg:col-span-1"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Products
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {stats.totalProducts}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Orders
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {stats.totalOrders}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Pending
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-600">
              {stats.pendingPayments}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Confirmed
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {stats.confirmed}
            </p>
          </article>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Public Store Link
          </p>
          <a
            href={storeUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className={`mt-1 block break-all text-xs sm:text-sm ${
              storeUrl
                ? "font-semibold text-teal-700 underline-offset-2 hover:underline"
                : "pointer-events-none text-slate-400"
            }`}
          >
            {storeUrl || "Store link will appear once seller slug is available"}
          </a>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {copyFeedback ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">
          {copyFeedback}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-5">
        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card lg:col-span-2">
          <h2 className="font-heading text-xl font-bold text-slate-900">
            Seller Profile
          </h2>
          <p className="mt-1 text-xs text-slate-500">Store slug: {seller?.slug}</p>
          <form className="mt-4 space-y-3" onSubmit={handleProfileSubmit}>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">
                Business name
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">UPI ID</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
                value={profileUpi}
                onChange={(event) => setProfileUpi(event.target.value)}
                placeholder="yourname@upi"
              />
            </label>
            <button
              type="submit"
              disabled={isSavingProfile}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400"
            >
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </form>
        </article>

        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card lg:col-span-3">
          <h2 className="font-heading text-xl font-bold text-slate-900">
            Add Product
          </h2>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={handleCreateProduct}
          >
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                Product title
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
                placeholder="Home-made Ragi Laddu (Box of 12)"
                value={productForm.title}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Price</span>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
                placeholder="499"
                value={productForm.price}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">
                Image URL
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
                placeholder="https://..."
                value={productForm.imageUrl}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    imageUrl: event.target.value,
                  }))
                }
              />
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                Description
              </span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
                placeholder="What does the customer get?"
                value={productForm.description}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Notes</span>
              <textarea
                className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-400 sm:text-sm"
                placeholder="Delivery info, pickup details, prep time"
                value={productForm.notes}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>

            <button
              type="submit"
              disabled={isCreatingProduct}
              className="sm:col-span-2 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:bg-teal-300"
            >
              {isCreatingProduct ? "Adding product..." : "Add Product"}
            </button>
          </form>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card lg:col-span-2">
          <h2 className="font-heading text-xl font-bold text-slate-900">
            Product Catalog
          </h2>

          {loading ? (
            <p className="mt-4 text-sm text-slate-600">Loading products...</p>
          ) : null}

          {!loading && products.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              No products yet. Add your first product above.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {products.map((product) => (
              <div
                key={product._id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="font-semibold text-slate-800">{product.title}</p>
                <p className="mt-1 text-sm text-slate-600">Rs {product.price}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card lg:col-span-3">
          <h2 className="font-heading text-xl font-bold text-slate-900">
            Incoming Orders
          </h2>

          {loading ? (
            <p className="mt-4 text-sm text-slate-600">Loading orders...</p>
          ) : null}

          {!loading && orders.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              Orders will appear here once customers place orders from your
              store.
            </p>
          ) : null}

          {orders.length > 0 ? (
            <div className="mt-4">
              <div className="space-y-3 md:hidden">
                {orders.map((order) => (
                  <article
                    key={order._id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {order.customerName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.customerPhone}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[order.paymentStatus]}`}
                      >
                        {order.paymentStatus}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      Product: {order.product?.title || "Product"}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-sm text-slate-700">
                      <span>Qty: {order.quantity || 1}</span>
                      <span className="font-semibold text-slate-900">
                        Rs {order.amount}
                      </span>
                    </div>
                    <select
                      className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-base outline-none focus:border-slate-400"
                      value={order.paymentStatus}
                      onChange={(event) =>
                        handleOrderStatusChange(
                          order._id,
                          event.target.value as OrderStatus
                        )
                      }
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-auto md:block">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">Product</th>
                      <th className="pb-2 pr-4">Qty</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-2">Update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order._id} className="border-b border-slate-100">
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-slate-800">
                            {order.customerName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {order.customerPhone}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {order.product?.title || "Product"}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {order.quantity || 1}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-slate-900">
                          Rs {order.amount}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[order.paymentStatus]}`}
                          >
                            {order.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 pr-2">
                          <select
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-slate-400"
                            value={order.paymentStatus}
                            onChange={(event) =>
                              handleOrderStatusChange(
                                order._id,
                                event.target.value as OrderStatus
                              )
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}
