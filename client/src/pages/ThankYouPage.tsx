import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { OrderStatus } from "../types";

type PublicOrderStatus = {
  _id: string;
  paymentStatus: OrderStatus;
};

const SUCCESS_STATUSES: OrderStatus[] = ["paid", "confirmed"];
const POLL_INTERVAL_MS = 3000;

export function ThankYouPage() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<PublicOrderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sellerSlug = searchParams.get("sellerSlug") || "";
  const orderIds = useMemo(
    () =>
      (searchParams.get("orderIds") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [searchParams]
  );

  const fetchStatuses = useCallback(async () => {
    if (orderIds.length === 0) {
      setError("Missing payment reference. Please return to the store.");
      setLoading(false);
      return;
    }

    try {
      const response = await api.get<{ orders: PublicOrderStatus[] }>("/orders/public/status", {
        params: {
          ids: orderIds.join(","),
          sellerSlug: sellerSlug || undefined,
        },
      });

      setOrders(response.data.orders);
      setError("");
    } catch {
      setError("Unable to verify payment status right now.");
    } finally {
      setLoading(false);
    }
  }, [orderIds, sellerSlug]);

  useEffect(() => {
    void fetchStatuses();
  }, [fetchStatuses]);

  const allSuccessful =
    orders.length > 0 &&
    orders.length === orderIds.length &&
    orders.every((order) => SUCCESS_STATUSES.includes(order.paymentStatus));

  const anyCancelled = orders.some((order) => order.paymentStatus === "cancelled");

  useEffect(() => {
    if (orderIds.length === 0 || allSuccessful || anyCancelled) {
      return;
    }

    const poller = window.setInterval(() => {
      void fetchStatuses();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(poller);
  }, [allSuccessful, anyCancelled, fetchStatuses, orderIds.length]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10">
      <section className="w-full rounded-3xl border border-white/70 bg-white/90 p-6 shadow-card sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Payment Status</p>
        <h1 className="mt-2 font-heading text-3xl font-bold text-slate-900">
          {allSuccessful ? "Thank you for your payment" : "We are checking your payment"}
        </h1>

        <p className="mt-3 text-sm text-slate-600">
          {allSuccessful
            ? "Your payment has been detected successfully. The seller can now continue processing your order."
            : anyCancelled
              ? "This payment attempt looks cancelled. You can go back to the store and try again."
              : "If you just finished the UPI payment, keep this page open. It will refresh automatically as soon as the order status changes."}
        </p>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Tracked orders</p>
            <button
              type="button"
              onClick={() => void fetchStatuses()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              {loading ? "Checking..." : "Check status"}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {orderIds.map((orderId) => {
              const order = orders.find((item) => item._id === orderId);
              const status = order?.paymentStatus || "pending";

              return (
                <div
                  key={orderId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="truncate text-xs text-slate-500">{orderId}</span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {sellerSlug && (
            <Link
              to={`/store/${sellerSlug}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Back to Store
            </Link>
          )}
          <button
            type="button"
            onClick={() => void fetchStatuses()}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Refresh Now
          </button>
        </div>
      </section>
    </main>
  );
}
