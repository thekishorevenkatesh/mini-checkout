const express = require("express");
const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const Seller = require("../models/Seller");
const Order = require("../models/Order");
const ParentOrder = require("../models/ParentOrder");
const TransactionLedger = require("../models/TransactionLedger");
const WebhookLog = require("../models/WebhookLog");
const auth = require("../middleware/auth");
const { collectKycIssues, isPayoutEligible, recordComplianceEvent } = require("../utils/kycCompliance");
const { applyAccountWebhookToSeller } = require("../utils/razorpayLinkedAccount");
const { trySendOrderConfirmationForParentOrder } = require("../utils/orderConfirmation");
const {
  getVendorTransferAmountPaise,
  hasProcessedTransfer,
  executeVendorTransfer,
  recordVendorTransferLedger,
} = require("../utils/settlement");

const router = express.Router();

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  return hmac.digest("hex") === signature;
}

async function processSubOrderTransfer(subOrder, razorpayPaymentId) {
  if (hasProcessedTransfer(subOrder)) {
    console.log(`[transfer] Skipping sub-order ${subOrder._id}: transfer already processed (${subOrder.transferId})`);
    return;
  }

  const seller = await Seller.findById(subOrder.seller);
  if (!seller) {
    subOrder.transferStatus = "failed";
    await subOrder.save();
    console.error(`[transfer] Seller not found for sub-order: ${subOrder._id}`);
    return;
  }

  if (!seller.razorpayAccountId || seller.razorpayAccountStatus !== "active") {
    subOrder.transferStatus = "failed";
    await subOrder.save();
    console.warn(`[transfer] Skipped: seller ${seller.businessName} has no active Razorpay linked account.`);
    return;
  }

  if (!isPayoutEligible(seller)) {
    subOrder.transferStatus = "failed";
    seller.payoutStatus = "blocked";
    recordComplianceEvent(seller, "route_transfer_blocked_incomplete_kyc", "system", {
      orderId: subOrder._id.toString(),
      missingFields: collectKycIssues(seller, {
        requireVerifiedPan: true,
        requireVerifiedKyc: true,
        requireBank: true,
      }),
    });
    await Promise.all([subOrder.save(), seller.save()]);
    console.warn(`[transfer] Blocked: seller ${seller.businessName} is not payout eligible.`);
    return;
  }

  try {
    const result = await executeVendorTransfer(razorpay, {
      paymentId: razorpayPaymentId,
      seller,
      subOrder,
    });

    if (result.skipped) {
      return;
    }

    subOrder.transferId = result.transferId;
    subOrder.transferStatus = "processed";
    await subOrder.save();

    await recordVendorTransferLedger({
      subOrder,
      seller,
      transferId: result.transferId,
      transferAmountPaise: result.transferAmountPaise,
    });

    console.log(
      `[transfer] Direct settlement to ${seller.businessName} (${seller.razorpayAccountId}): ${result.transferAmountPaise} paise`
    );
  } catch (err) {
    console.error(`[transfer] Route API failed for sub-order ${subOrder._id}:`, err.message);
    subOrder.transferStatus = "failed";
    await subOrder.save();
  }
}

router.post("/webhook", async (req, res) => {
  const eventId = req.headers["x-razorpay-event-id"] || req.body?.event_id;
  const signature = req.headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "zensos_webhook_secret_dev";
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!eventId) {
    return res.status(400).json({ message: "Missing event ID" });
  }

  const isMockMode = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";
  if (!isMockMode) {
    if (!verifySignature(rawBody, signature, secret)) {
      console.warn(`[Webhook Warning] Signature verification failed for event: ${eventId}`);
      return res.status(400).json({ message: "Invalid signature" });
    }
  }

  let webhookLog;
  try {
    webhookLog = await WebhookLog.create({
      eventId,
      eventType: req.body.event,
      payload: req.body,
      processed: false,
    });
  } catch (error) {
    if (error.code === 11000) {
      console.log(`[Webhook] Duplicate event blocked: ${eventId}`);
      return res.status(200).json({ status: "already_processed" });
    }
    console.error("[Webhook Error] Logging failed:", error);
    return res.status(500).json({ message: "Webhook logging failed" });
  }

  try {
    const event = req.body.event;
    console.log(`[Webhook Logged] Event: ${event} (${eventId})`);

    switch (event) {
      case "payment.captured":
        await handlePaymentCaptured(req.body.payload.payment.entity);
        break;
      case "payment.failed":
        await handlePaymentFailed(req.body.payload.payment.entity);
        break;
      case "transfer.processed":
        await handleTransferProcessed(req.body.payload.transfer.entity);
        break;
      case "transfer.failed":
        await handleTransferFailed(req.body.payload.transfer.entity);
        break;
      case "settlement.processed":
        await handleSettlementProcessed(req.body.payload.settlement.entity);
        break;
      case "refund.processed":
        await handleRefundProcessed(req.body.payload.refund.entity);
        break;
      case "account.activated":
        await handleAccountActivated(req.body.payload.account.entity);
        break;
      case "account.updated":
        await handleAccountUpdated(req.body.payload.account.entity);
        break;
      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    webhookLog.processed = true;
    webhookLog.processedAt = new Date();
    await webhookLog.save();
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error(`[Webhook Error] Processing failed for event ${eventId}:`, err);
    webhookLog.error = err.message;
    await webhookLog.save();
    return res.status(500).json({ message: "Webhook processing failed" });
  }
});

async function handlePaymentCaptured(payment) {
  const razorpayOrderId = payment.order_id;
  const razorpayPaymentId = payment.id;

  console.log(`[payment.captured] Processing order: ${razorpayOrderId}`);

  const parentOrder = await ParentOrder.findOne({ razorpayOrderId }).populate("subOrders");
  if (!parentOrder) {
    console.warn(`[payment.captured] No ParentOrder found for ID: ${razorpayOrderId}`);
    return;
  }

  if (parentOrder.paymentStatus === "paid") {
    console.log(`[payment.captured] Parent order already paid: ${razorpayOrderId}`);
    for (const subOrder of parentOrder.subOrders) {
      if (subOrder.paymentStatus !== "paid") {
        subOrder.paymentStatus = "paid";
        await subOrder.save();
      }
      await processSubOrderTransfer(subOrder, parentOrder.razorpayPaymentId || razorpayPaymentId);
    }
    await trySendOrderConfirmationForParentOrder(parentOrder._id);
    return;
  }

  parentOrder.paymentStatus = "paid";
  parentOrder.razorpayPaymentId = razorpayPaymentId;
  await parentOrder.save();

  for (const subOrder of parentOrder.subOrders) {
    subOrder.paymentStatus = "paid";
    await subOrder.save();
    await processSubOrderTransfer(subOrder, razorpayPaymentId);
  }

  await trySendOrderConfirmationForParentOrder(parentOrder._id);
}

async function handlePaymentFailed(payment) {
  const razorpayOrderId = payment.order_id;
  console.log(`[payment.failed] Order ID: ${razorpayOrderId}`);

  const parentOrder = await ParentOrder.findOne({ razorpayOrderId }).populate("subOrders");
  if (!parentOrder) return;

  parentOrder.paymentStatus = "failed";
  await parentOrder.save();

  for (const subOrder of parentOrder.subOrders) {
    subOrder.paymentStatus = "cancelled";
    subOrder.transferStatus = "untransferred";
    await subOrder.save();
  }
}

async function handleTransferProcessed(transfer) {
  const transferId = transfer.id;
  console.log(`[transfer.processed] Transfer ID: ${transferId}`);

  const subOrder = await Order.findOne({ transferId });
  if (subOrder) {
    subOrder.transferStatus = "processed";
    await subOrder.save();
  }
}

async function handleTransferFailed(transfer) {
  const transferId = transfer.id;
  console.log(`[transfer.failed] Transfer ID: ${transferId}`);

  const subOrder = await Order.findOne({ transferId });
  if (subOrder) {
    subOrder.transferStatus = "failed";
    await subOrder.save();
  }
}

async function handleSettlementProcessed(settlement) {
  console.log(`[settlement.processed] Settlement ID: ${settlement.id}, Amount: ${settlement.amount}`);
}

async function handleRefundProcessed(refund) {
  const paymentId = refund.payment_id;
  const refundId = refund.id;
  console.log(`[refund.processed] Payment: ${paymentId}, Refund: ${refundId}`);

  const parentOrder = await ParentOrder.findOne({ razorpayPaymentId: paymentId }).populate("subOrders");
  if (!parentOrder) return;

  for (const subOrder of parentOrder.subOrders) {
    if (subOrder.paymentStatus !== "paid" && subOrder.paymentStatus !== "delivered") continue;

    subOrder.paymentStatus = "cancelled";
    if (subOrder.transferId) {
      subOrder.transferStatus = "reversed";
    }
    await subOrder.save();

    const vendorSharePaise = getVendorTransferAmountPaise(subOrder);
    await TransactionLedger.create({
      orderId: subOrder._id,
      sellerId: subOrder.seller,
      amountPaise: vendorSharePaise,
      type: "debit",
      purpose: "refund",
      status: "reversed",
      razorpayTransferId: subOrder.transferId || "",
    });
  }
}

async function handleAccountActivated(account) {
  const razorpayAccountId = account.id;
  console.log(`[account.activated] Razorpay linked account: ${razorpayAccountId}`);

  const seller = await Seller.findOne({ razorpayAccountId });
  if (seller) {
    applyAccountWebhookToSeller(seller, account);
    await seller.save();
  }
}

async function handleAccountUpdated(account) {
  const razorpayAccountId = account.id;
  console.log(`[account.updated] Razorpay linked account: ${razorpayAccountId}`);

  const seller = await Seller.findOne({ razorpayAccountId });
  if (seller) {
    applyAccountWebhookToSeller(seller, account);
    await seller.save();
  }
}

router.post("/retry-transfer/:orderId", auth, async (req, res) => {
  try {
    const subOrder = await Order.findById(req.params.orderId).populate("parentOrder");
    if (!subOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (String(subOrder.seller) !== String(req.sellerId)) {
      return res.status(403).json({ message: "Not authorized to retry transfer for this order" });
    }

    if (hasProcessedTransfer(subOrder)) {
      return res.status(400).json({ message: "Vendor settlement already completed for this order" });
    }

    const paymentId = subOrder.parentOrder?.razorpayPaymentId;
    if (!paymentId) {
      return res.status(400).json({ message: "Order payment has not been captured yet" });
    }

    if (subOrder.paymentStatus !== "paid" && subOrder.paymentStatus !== "delivered") {
      return res.status(400).json({ message: "Transfer can only be retried for paid orders" });
    }

    await processSubOrderTransfer(subOrder, paymentId);
    const refreshed = await Order.findById(subOrder._id);

    if (refreshed.transferStatus === "failed") {
      return res.status(500).json({ message: "Transfer retry failed", subOrder: refreshed });
    }

    return res.json({ message: "Vendor settlement completed", subOrder: refreshed });
  } catch (error) {
    console.error("[Manual Retry Error]:", error);
    return res.status(500).json({ message: "Could not execute transfer retry", error: error.message });
  }
});

router.post("/refund/:orderId", auth, async (req, res) => {
  try {
    const subOrder = await Order.findById(req.params.orderId).populate("parentOrder");
    if (!subOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (String(subOrder.seller) !== String(req.sellerId)) {
      return res.status(403).json({ message: "Not authorized to refund this order" });
    }

    if (subOrder.paymentStatus !== "paid" && subOrder.paymentStatus !== "delivered") {
      return res.status(400).json({ message: "Can only refund paid orders" });
    }

    const paymentId = subOrder.parentOrder?.razorpayPaymentId;
    if (!paymentId) {
      return res.status(400).json({ message: "No payment record for this order" });
    }

    const vendorSharePaise = getVendorTransferAmountPaise(subOrder);
    const isMock = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";

    if (subOrder.transferId) {
      if (isMock) {
        await razorpay.transfers.reverse(subOrder.transferId, { amount: vendorSharePaise });
      } else {
        try {
          await new Promise((resolve, reject) => {
            const r = require("https").request(
              `https://api.razorpay.com/v1/transfers/${subOrder.transferId}/reversals`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization:
                    "Basic " +
                    Buffer.from(
                      process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET
                    ).toString("base64"),
                },
              },
              (apiRes) => {
                let data = "";
                apiRes.on("data", (chunk) => (data += chunk));
                apiRes.on("end", () => resolve(JSON.parse(data)));
              }
            );
            r.on("error", reject);
            r.write(JSON.stringify({ amount: vendorSharePaise }));
            r.end();
          });
        } catch (err) {
          console.warn("Linked transfer reversal error:", err.message);
        }
      }
    }

    subOrder.paymentStatus = "cancelled";
    subOrder.transferStatus = subOrder.transferId ? "reversed" : subOrder.transferStatus;
    await subOrder.save();

    await TransactionLedger.create({
      orderId: subOrder._id,
      sellerId: subOrder.seller,
      amountPaise: vendorSharePaise,
      type: "debit",
      purpose: "refund",
      status: "reversed",
      razorpayTransferId: subOrder.transferId || "",
    });

    return res.json({ message: "Order refund and vendor transfer reversal completed", subOrder });
  } catch (error) {
    console.error("[Refund Error]:", error);
    return res.status(500).json({ message: "Could not trigger refund", error: error.message });
  }
});

module.exports = router;
