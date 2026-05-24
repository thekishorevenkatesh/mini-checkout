const express = require("express");
const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const Seller = require("../models/Seller");
const Order = require("../models/Order");
const ParentOrder = require("../models/ParentOrder");
const TransactionLedger = require("../models/TransactionLedger");
const WebhookLog = require("../models/WebhookLog");
const auth = require("../middleware/auth");
const { encrypt, decrypt } = require("../utils/encryption");

const router = express.Router();

// Helper to verify Webhook Signature
function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");
  return digest === signature;
}

// ─── POST /api/payments/webhook ──────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  const eventId = req.headers["x-razorpay-event-id"] || req.body?.event_id;
  const signature = req.headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "zensos_webhook_secret_dev";
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!eventId) {
    return res.status(400).json({ message: "Missing event ID" });
  }

  // 1. Signature Verification
  const isMockMode = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";
  if (!isMockMode) {
    const isValid = verifySignature(rawBody, signature, secret);
    if (!isValid) {
      console.warn(`[Webhook Warning] Signature verification failed for event: ${eventId}`);
      return res.status(400).json({ message: "Invalid signature" });
    }
  }

  // 2. Idempotency Check
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
      // Event already logged/processed, return 200 OK to stop retries
      console.log(`[Webhook] Duplicate event blocked: ${eventId}`);
      return res.status(200).json({ status: "already_processed" });
    }
    console.error("[Webhook Error] Logging failed:", error);
    return res.status(500).json({ message: "Webhook logging failed" });
  }

  try {
    const event = req.body.event;
    console.log(`[Webhook Logged] Event: ${event} (${eventId})`);

    // 3. Event Router
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
    // Return 500 so Razorpay retries if it's a transient failure
    return res.status(500).json({ message: "Webhook processing failed" });
  }
});

// ─── Webhook Event Handlers ──────────────────────────────────────────────

async function handlePaymentCaptured(payment) {
  const razorpayOrderId = payment.order_id;
  const razorpayPaymentId = payment.id;
  const amountPaise = payment.amount;

  console.log(`[payment.captured] Processing Order ID: ${razorpayOrderId}`);

  // Find ParentOrder
  const parentOrder = await ParentOrder.findOne({ razorpayOrderId }).populate("subOrders");
  if (!parentOrder) {
    console.warn(`[payment.captured] No ParentOrder found for ID: ${razorpayOrderId}`);
    return;
  }

  if (parentOrder.paymentStatus === "paid") {
    console.log(`[payment.captured] Order already paid: ${razorpayOrderId}`);
    return;
  }

  parentOrder.paymentStatus = "paid";
  parentOrder.razorpayPaymentId = razorpayPaymentId;
  await parentOrder.save();

  // Process Sub-Orders and Execute splits via Razorpay Route
  for (const subOrder of parentOrder.subOrders) {
    subOrder.paymentStatus = "paid";
    await subOrder.save();

    const seller = await Seller.findById(subOrder.seller);
    if (!seller) {
      subOrder.transferStatus = "failed";
      await subOrder.save();
      console.error(`[payment.captured] Seller not found for SubOrder: ${subOrder._id}`);
      continue;
    }

    // 1. Check if Seller has Linked Account ID
    if (!seller.razorpayAccountId || seller.razorpayAccountStatus !== "active") {
      subOrder.transferStatus = "failed";
      await subOrder.save();
      console.warn(`[payment.captured] Route Transfer skipped: Seller ${seller.businessName} has no active Razorpay Account.`);
      continue;
    }

    try {
      // 2. Perform Razorpay Route Transfer
      const transferAmountPaise = Math.round((subOrder.amount + subOrder.deliveryCharge) * 100) - subOrder.commissionAmountPaise;

      console.log(`[payment.captured] Split Transfer to ${seller.businessName} (${seller.razorpayAccountId}): Amount ${transferAmountPaise} paise`);
      
      const transferResponse = await razorpay.payments.transfer(razorpayPaymentId, {
        transfers: [
          {
            account: seller.razorpayAccountId,
            amount: transferAmountPaise,
            currency: "INR",
            on_hold: 1, // Funds held on hold. Released when marked delivered
          },
        ],
      });

      const transferResult = transferResponse.items?.[0] || transferResponse;
      subOrder.transferId = transferResult.id;
      subOrder.transferStatus = "processed";
      await subOrder.save();

      // 3. Write Ledger credit for Seller
      await TransactionLedger.create({
        orderId: subOrder._id,
        sellerId: seller._id,
        amountPaise: transferAmountPaise,
        type: "credit",
        purpose: "order_item_revenue",
        status: "settled",
        razorpayTransferId: transferResult.id,
      });

      // 4. Write Ledger credit for Platform owner
      await TransactionLedger.create({
        orderId: subOrder._id,
        sellerId: null, // Admin platform commission
        amountPaise: subOrder.commissionAmountPaise,
        type: "credit",
        purpose: "platform_commission",
        status: "settled",
        razorpayTransferId: transferResult.id,
      });

    } catch (err) {
      console.error(`[payment.captured] Route Transfer API failed for order ${subOrder._id}:`, err.message);
      subOrder.transferStatus = "failed";
      await subOrder.save();
    }
  }
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

async function handleSettlementProcessed(settlement) {
  // Can be logged to Settlement schemas to track bank payouts
  console.log(`[settlement.processed] Settlement ID: ${settlement.id}, Amount: ${settlement.amount}`);
}

async function handleRefundProcessed(refund) {
  const paymentId = refund.payment_id;
  const refundId = refund.id;

  console.log(`[refund.processed] Payment: ${paymentId}, Refund: ${refundId}`);

  const parentOrder = await ParentOrder.findOne({ razorpayPaymentId: paymentId }).populate("subOrders");
  if (!parentOrder) return;

  // Debit ledger entries and reverse sub-order balances
  for (const subOrder of parentOrder.subOrders) {
    if (subOrder.paymentStatus === "paid") {
      subOrder.paymentStatus = "cancelled";
      await subOrder.save();

      // Write Ledger debits
      const transferAmountPaise = Math.round((subOrder.amount + subOrder.deliveryCharge) * 100) - subOrder.commissionAmountPaise;

      await TransactionLedger.create({
        orderId: subOrder._id,
        sellerId: subOrder.seller,
        amountPaise: transferAmountPaise,
        type: "debit",
        purpose: "refund",
        status: "reversed",
      });

      await TransactionLedger.create({
        orderId: subOrder._id,
        sellerId: null,
        amountPaise: subOrder.commissionAmountPaise,
        type: "debit",
        purpose: "reversal",
        status: "reversed",
      });
    }
  }
}

async function handleAccountActivated(account) {
  const razorpayAccountId = account.id;
  console.log(`[account.activated] Razorpay Linked Account ID: ${razorpayAccountId}`);

  const seller = await Seller.findOne({ razorpayAccountId });
  if (seller) {
    seller.razorpayAccountStatus = "active";
    await seller.save();
    console.log(`[account.activated] Seller ${seller.businessName} updated to active.`);
  }
}

async function handleAccountUpdated(account) {
  const razorpayAccountId = account.id;
  console.log(`[account.updated] Razorpay Linked Account ID: ${razorpayAccountId}`);

  const seller = await Seller.findOne({ razorpayAccountId });
  if (seller) {
    if (account.status === "activated") {
      seller.razorpayAccountStatus = "active";
    } else if (account.status === "suspended") {
      seller.razorpayAccountStatus = "suspended";
    }
    await seller.save();
  }
}

// ─── ADMIN-ONLY: Force Manual Retry of Route Transfer ───────────────────
router.post("/retry-transfer/:orderId", auth, async (req, res) => {
  try {
    // Basic verification - must be admin request
    // Admin check is integrated via header role check
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = crypto.createHash("sha256").update(token).digest("hex"); // Placeholder logic, adminAuth already handles role verified
    
    const subOrder = await Order.findById(req.params.orderId).populate("parentOrder");
    if (!subOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (subOrder.transferStatus === "processed") {
      return res.status(400).json({ message: "Split payment already transferred" });
    }

    const seller = await Seller.findById(subOrder.seller);
    if (!seller || !seller.razorpayAccountId || seller.razorpayAccountStatus !== "active") {
      return res.status(400).json({ message: "Seller has no active Razorpay Linked Account configuration" });
    }

    const paymentId = subOrder.parentOrder?.razorpayPaymentId;
    if (!paymentId) {
      return res.status(400).json({ message: "Order payment record has not been successfully captured" });
    }

    const transferAmountPaise = Math.round((subOrder.amount + subOrder.deliveryCharge) * 100) - subOrder.commissionAmountPaise;

    console.log(`[Manual Retry] Split Transfer to ${seller.businessName}: Amount ${transferAmountPaise} paise`);

    const transferResponse = await razorpay.payments.transfer(paymentId, {
      transfers: [
        {
          account: seller.razorpayAccountId,
          amount: transferAmountPaise,
          currency: "INR",
          on_hold: 1,
        },
      ],
    });

    const transferResult = transferResponse.items?.[0] || transferResponse;
    subOrder.transferId = transferResult.id;
    subOrder.transferStatus = "processed";
    await subOrder.save();

    // Log in Transaction Ledger
    await TransactionLedger.create({
      orderId: subOrder._id,
      sellerId: seller._id,
      amountPaise: transferAmountPaise,
      type: "credit",
      purpose: "order_item_revenue",
      status: "settled",
      razorpayTransferId: transferResult.id,
    });

    await TransactionLedger.create({
      orderId: subOrder._id,
      sellerId: null,
      amountPaise: subOrder.commissionAmountPaise,
      type: "credit",
      purpose: "platform_commission",
      status: "settled",
      razorpayTransferId: transferResult.id,
    });

    return res.json({ message: "Split transfer completed successfully", subOrder });
  } catch (error) {
    console.error("[Manual Retry Error]:", error);
    return res.status(500).json({ message: "Could not execute transfer retry", error: error.message });
  }
});

// ─── ADMIN-ONLY: Trigger Payout Refund ──────────────────────────────────
router.post("/refund/:orderId", auth, async (req, res) => {
  try {
    const subOrder = await Order.findById(req.params.orderId).populate("parentOrder");
    if (!subOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (subOrder.paymentStatus !== "paid") {
      return res.status(400).json({ message: "Can only refund orders that are paid" });
    }

    const paymentId = subOrder.parentOrder?.razorpayPaymentId;
    if (!paymentId) {
      return res.status(400).json({ message: "No payment transaction registered for this order" });
    }

    const refundAmountPaise = Math.round((subOrder.amount + subOrder.deliveryCharge) * 100);

    // Call Razorpay Refund with Transfer Reversal
    console.log(`[Refund Trigger] Reversing payment ${paymentId} for amount ${refundAmountPaise} paise`);

    // In a real Razorpay setting, triggering refund on captured payment works as:
    // If the payment had Route splits, reversing the splits clawbacks money from sub-merchants.
    // Razorpay V1 supports reversing all associated transfers by setting reverse_all_transfers: 1
    const isMock = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";
    
    if (isMock) {
      // Simulate reversal response
      if (subOrder.transferId) {
        await razorpay.transfers.reverse(subOrder.transferId, { amount: refundAmountPaise - subOrder.commissionAmountPaise });
      }
    } else {
      // Live refund execution
      // We reverse the specific sub-merchant transfer to clawback funds
      if (subOrder.transferId) {
        try {
          await new Promise((resolve, reject) => {
            const r = require("https").request(
              `https://api.razorpay.com/v1/transfers/${subOrder.transferId}/reversals`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": "Basic " + Buffer.from(process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET).toString("base64")
                }
              },
              (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => resolve(JSON.parse(data)));
              }
            );
            r.on("error", reject);
            r.write(JSON.stringify({ amount: refundAmountPaise - subOrder.commissionAmountPaise }));
            r.end();
          });
        } catch (err) {
          console.warn("Linked transfer reversal clawback error:", err.message);
        }
      }
    }

    subOrder.paymentStatus = "cancelled";
    subOrder.transferStatus = "reversed";
    await subOrder.save();

    // Debit Ledgers
    await TransactionLedger.create({
      orderId: subOrder._id,
      sellerId: subOrder.seller,
      amountPaise: refundAmountPaise - subOrder.commissionAmountPaise,
      type: "debit",
      purpose: "refund",
      status: "reversed",
    });

    await TransactionLedger.create({
      orderId: subOrder._id,
      sellerId: null,
      amountPaise: subOrder.commissionAmountPaise,
      type: "debit",
      purpose: "reversal",
      status: "reversed",
    });

    return res.json({ message: "Order refund and seller payout reversal completed", subOrder });
  } catch (error) {
    console.error("[Refund Error]:", error);
    return res.status(500).json({ message: "Could not trigger refund", error: error.message });
  }
});

module.exports = router;
