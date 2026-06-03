import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { AppIcon } from "../components/ui/AppIcon";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useToast } from "../context/ToastContext";
import type { OrderStatus } from "../types";

type PublicOrderStatus = {
  _id: string;
  paymentStatus: OrderStatus;
  paymentMethod?: "prepaid" | "cod";
};

const SUCCESS_STATUSES: OrderStatus[] = ["paid", "delivered"];
const POLL_INTERVAL_MS = 3000;

export function ThankYouPage() {
  const { showError } = useToast();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<PublicOrderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sellerSlug = searchParams.get("sellerSlug") || "";
  const requestedPaymentMethod = searchParams.get("paymentMethod") || "";
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

  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);

  const allSuccessful =
    orders.length > 0 &&
    orders.length === orderIds.length &&
    orders.every((order) => SUCCESS_STATUSES.includes(order.paymentStatus));
  const isCodOrder =
    requestedPaymentMethod === "cod" ||
    (orders.length > 0 && orders.every((order) => order.paymentMethod === "cod"));
  const orderAccepted =
    isCodOrder &&
    orders.length > 0 &&
    orders.length === orderIds.length &&
    orders.every((order) => order.paymentStatus !== "cancelled");

  const anyCancelled = orders.some((order) => order.paymentStatus === "cancelled");

  useEffect(() => {
    if (orderIds.length === 0 || allSuccessful || orderAccepted || anyCancelled) {
      return;
    }

    const poller = window.setInterval(() => {
      void fetchStatuses();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(poller);
  }, [allSuccessful, anyCancelled, fetchStatuses, orderAccepted, orderIds.length]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-3 py-8 sm:px-4 sm:py-10">
      <Card className="w-full overflow-hidden p-0">
        <div className="border-b app-divider bg-gradient-to-r from-white via-teal-50/70 to-sky-50/70 px-5 py-5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:px-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-teal-100 bg-white/85 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-700 dark:border-teal-900/40 dark:bg-slate-950/80 dark:text-teal-300">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white dark:bg-teal-500">
              <AppIcon name={allSuccessful || orderAccepted ? "check" : "pending"} className="text-[14px]" />
            </span>
            {isCodOrder ? "Order Status" : "Payment Status"}
          </div>
          <h1 className="mt-4 font-heading text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
          {orderAccepted ? "Thank you for your order" : allSuccessful ? "Thank you for your payment" : "We are checking your payment"}
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          {orderAccepted
            ? "Your COD order has been placed successfully. We have emailed the order confirmation with seller and item details."
            : allSuccessful
            ? "Your payment has been detected successfully. The seller can now continue processing your order."
            : anyCancelled
              ? "This payment attempt looks cancelled. You can go back to the store and try again."
              : "If you just finished the UPI payment, keep this page open. It will refresh automatically as soon as the order status changes."}
          </p>
        </div>

        <div className="p-5 sm:p-8">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/75">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Tracked Orders</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Live status for the order IDs from this checkout.</p>
            </div>
            <Button
              type="button"
              onClick={() => void fetchStatuses()}
              variant="secondary"
              loading={loading}
              className="w-full px-3 py-1.5 sm:w-auto"
            >
              Check status
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {orderIds.map((orderId) => {
              const order = orders.find((item) => item._id === orderId);
              const status = order?.paymentStatus || "pending";

              return (
                <div
                  key={orderId}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="w-full break-all text-xs text-slate-500 sm:w-auto sm:truncate">{orderId}</span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <AppIcon name="store" className="text-[14px]" />
              Back to Store
            </Link>
          )}
          <Button
            type="button"
            onClick={() => void fetchStatuses()}
            loading={loading}
          >
            <AppIcon name="refresh" className="text-[14px]" />
            Refresh Now
          </Button>
        </div>
        </div>
      </Card>
    </main>
  );
}
