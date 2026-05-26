/**
 * Direct vendor settlement helpers.
 *
 * New orders transfer the full sub-order total (items + delivery) to the vendor
 * linked account immediately after payment.captured — no platform commission and
 * no on-hold escrow. Historical orders may still have commissionAmountPaise > 0;
 * refund/reversal math respects stored values for backward compatibility.
 */

function getSubOrderTotalPaise(subOrder) {
  return Math.round((Number(subOrder.amount) + Number(subOrder.deliveryCharge || 0)) * 100);
}

/** Vendor Route transfer amount in paise (full share for new orders). */
function getVendorTransferAmountPaise(subOrder) {
  const totalPaise = getSubOrderTotalPaise(subOrder);
  const commissionPaise = Math.max(0, Number(subOrder.commissionAmountPaise) || 0);
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

  await TransactionLedger.create({
    orderId: subOrder._id,
    sellerId: seller._id,
    amountPaise: transferAmountPaise,
    type: "credit",
    purpose: "order_item_revenue",
    status: "settled",
    razorpayTransferId: transferId,
  });
}

module.exports = {
  getSubOrderTotalPaise,
  getVendorTransferAmountPaise,
  hasProcessedTransfer,
  executeVendorTransfer,
  recordVendorTransferLedger,
};
