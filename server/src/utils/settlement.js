/**
 * Direct vendor settlement helpers.
 *
 * New orders transfer the stored vendor payable amount to the vendor linked
 * account immediately after payment.captured. The remaining platform commission
 * stays in the platform Razorpay account.
 */

function getSubOrderTotalPaise(subOrder) {
  if (Number(subOrder.grossAmountPaise) > 0) {
    return Math.round(Number(subOrder.grossAmountPaise));
  }
  return Math.round((Number(subOrder.amount) + Number(subOrder.deliveryCharge || 0)) * 100);
}

/** Vendor Route transfer amount in paise. */
function getVendorTransferAmountPaise(subOrder) {
  if (Number(subOrder.vendorAmountPaise) > 0) {
    return Math.round(Number(subOrder.vendorAmountPaise));
  }

  const totalPaise = getSubOrderTotalPaise(subOrder);
  const commissionPaise = Math.max(
    0,
    Number(subOrder.platformFeePaise) || Number(subOrder.commissionAmountPaise) || 0
  );
  return Math.max(0, totalPaise - commissionPaise);
}

function hasProcessedTransfer(subOrder) {
  return Boolean(subOrder.transferId) && subOrder.transferStatus === "processed";
}

async function executeVendorTransfer(razorpay, { paymentId, seller, subOrder }) {
  if (hasProcessedTransfer(subOrder)) {
    return { skipped: true, reason: "already_processed", transferId: subOrder.transferId };
  }

  const transferAmountPaise = getVendorTransferAmountPaise(subOrder);
  if (transferAmountPaise <= 0) {
    throw new Error(`Invalid transfer amount for order ${subOrder._id}`);
  }

  const transferResponse = await razorpay.payments.transfer(paymentId, {
    transfers: [
      {
        account: seller.razorpayAccountId,
        amount: transferAmountPaise,
        currency: "INR",
        on_hold: 0,
      },
    ],
  });

  const transferResult = transferResponse.items?.[0] || transferResponse;
  return {
    skipped: false,
    transferId: transferResult.id,
    transferAmountPaise,
    transferResult,
  };
}

async function recordVendorTransferLedger({ subOrder, seller, transferId, transferAmountPaise }) {
  const TransactionLedger = require("../models/TransactionLedger");

  const existing = await TransactionLedger.findOne({
    orderId: subOrder._id,
    sellerId: seller._id,
    amountPaise: transferAmountPaise,
    type: "credit",
    purpose: "order_item_revenue",
  });
  if (existing) return existing;

  return TransactionLedger.create({
    orderId: subOrder._id,
    sellerId: seller._id,
    amountPaise: transferAmountPaise,
    type: "credit",
    purpose: "order_item_revenue",
    status: "settled",
    razorpayTransferId: transferId,
  });
}

async function recordPlatformCommissionLedger({ subOrder, status = "settled" }) {
  const TransactionLedger = require("../models/TransactionLedger");
  const amountPaise = Math.max(
    0,
    Number(subOrder.platformFeePaise) || Number(subOrder.commissionAmountPaise) || 0
  );
  if (amountPaise <= 0) return null;

  const existing = await TransactionLedger.findOne({
    orderId: subOrder._id,
    sellerId: null,
    amountPaise,
    type: "credit",
    purpose: "platform_commission",
  });
  if (existing) return existing;

  return TransactionLedger.create({
    orderId: subOrder._id,
    sellerId: null,
    amountPaise,
    type: "credit",
    purpose: "platform_commission",
    status,
    razorpayTransferId: subOrder.transferId || "",
  });
}

module.exports = {
  getSubOrderTotalPaise,
  getVendorTransferAmountPaise,
  hasProcessedTransfer,
  executeVendorTransfer,
  recordPlatformCommissionLedger,
  recordVendorTransferLedger,
};
