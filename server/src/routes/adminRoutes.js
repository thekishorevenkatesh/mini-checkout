const express = require("express");
const jwt = require("jsonwebtoken");
const Seller = require("../models/Seller");
const { ADMIN_SELLER_OMIT, toAdminSellerView } = require("../utils/adminSellerView");

const router = express.Router();

function issueAdminToken(username) {
  return jwt.sign(
    { role: "admin", username },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "12h" }
  );
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ message: "Admin token missing" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (payload?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.adminUsername = payload.username || "admin";
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
}

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin123";

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = issueAdminToken(expectedUsername);
  return res.json({ token, username: expectedUsername });
});

router.get("/sellers", adminAuth, async (req, res) => {
  try {
    const status = String(req.query.status || "pending").trim();
    const query =
      status && ["pending", "approved", "rejected", "suspended"].includes(status)
        ? { approvalStatus: status }
        : {};

    const sellers = await Seller.find(query)
      .select(ADMIN_SELLER_OMIT)
      .sort({ createdAt: -1 });

    return res.json({
      sellers: sellers.map((seller) => toAdminSellerView(seller)),
    });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to fetch sellers" });
  }
});

router.get("/sellers/:sellerId", adminAuth, async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId).select(ADMIN_SELLER_OMIT);

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    return res.json({ seller: toAdminSellerView(seller) });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to fetch seller details" });
  }
});

const TransactionLedger = require("../models/TransactionLedger");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const razorpay = require("../utils/razorpay");
const {
  collectKycIssues,
  isPayoutEligible,
  recordComplianceEvent,
} = require("../utils/kycCompliance");
const {
  collectLinkedAccountBlockers,
  provisionVendorLinkedAccount,
  syncLinkedAccountOnboardingStatus,
} = require("../utils/razorpayLinkedAccount");
const {
  getPlatformCommissionPercentage,
  normalizeCommissionPercentage,
  setPlatformCommissionPercentage,
} = require("../utils/platformSettings");
const {
  executeVendorTransfer,
  hasProcessedTransfer,
  recordPlatformCommissionLedger,
  recordVendorTransferLedger,
} = require("../utils/settlement");

router.patch("/sellers/:sellerId/approval", adminAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["approved", "rejected", "pending", "suspended"].includes(status)) {
      return res.status(400).json({ message: "Invalid approval status" });
    }

    const seller = await Seller.findById(req.params.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    seller.approvalStatus = status;
    syncLinkedAccountOnboardingStatus(seller);

    if (status === "approved") {
      const approvalBlockers = collectLinkedAccountBlockers(seller);
      if (approvalBlockers.length > 0) {
        seller.approvalStatus = "pending";
        seller.storePublished = false;
        seller.payoutStatus = "blocked";
        seller.linkedAccountOnboardingStatus = "kyc_incomplete";
        recordComplianceEvent(seller, "approval_blocked_incomplete_kyc", req.adminUsername || "admin", {
          missingFields: approvalBlockers,
        });
        await seller.save();
        return res.status(400).json({
          message: "Cannot approve seller until mandatory PAN, KYC documents, bank details, and business contact fields are verified.",
          missingFields: approvalBlockers,
        });
      }

      seller.storePublished = true;
      seller.publishRequestedAt = seller.publishRequestedAt || new Date();
      seller.approvedAt = new Date();
      seller.approvedBy = req.adminUsername || "admin";
      seller.onboardingProgress = "approved";
      seller.linkedAccountOnboardingStatus = "linked_account_pending";

      try {
        await provisionVendorLinkedAccount(seller, { actor: req.adminUsername || "admin" });
      } catch (err) {
        console.error("[Admin Approval] Razorpay linked account provisioning failed:", err.message);
        seller.storePublished = false;
        seller.approvalStatus = "pending";
        seller.onboardingProgress = "kyc_verified";
        await seller.save();
        return res.status(502).json({
          message: "Seller KYC is verified, but Razorpay linked account creation failed. Approval was not completed.",
          detail: err.message,
          missingFields: err.missingFields || [],
          linkedAccountOnboardingStatus: seller.linkedAccountOnboardingStatus,
        });
      }

      if (seller.razorpayAccountId && seller.razorpayAccountStatus === "active") {
        seller.payoutStatus = "enabled";
      }
    } else if (status === "suspended") {
      seller.storePublished = false;
      seller.razorpayAccountStatus = "suspended";
      seller.payoutStatus = "suspended";
    } else {
      seller.storePublished = false;
      seller.payoutStatus = "blocked";
      if (status === "pending") {
        seller.publishRequestedAt = new Date();
      }
      seller.approvedAt = null;
      seller.approvedBy = "";
      syncLinkedAccountOnboardingStatus(seller);
    }

    await seller.save();

    const refreshed = await Seller.findById(seller._id).select(ADMIN_SELLER_OMIT);

    return res.json({
      seller: toAdminSellerView(refreshed),
    });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to update seller approval" });
  }
});

// ─── ADMIN: Fetch Financial Ledgers ─────────────────────────────────────
router.patch("/sellers/:sellerId/kyc", adminAuth, async (req, res) => {
  try {
    const { panVerificationStatus, kycStatus, note } = req.body || {};
    if (
      panVerificationStatus &&
      !["pending", "verified", "rejected"].includes(panVerificationStatus)
    ) {
      return res.status(400).json({ message: "Invalid PAN verification status" });
    }
    if (kycStatus && !["incomplete", "pending", "verified", "rejected"].includes(kycStatus)) {
      return res.status(400).json({ message: "Invalid KYC status" });
    }

    const seller = await Seller.findById(req.params.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const blockers = collectKycIssues(seller, { requireBank: true, requireDocuments: true });
    if ((panVerificationStatus === "verified" || kycStatus === "verified") && blockers.length > 0) {
      return res.status(400).json({
        message: "Cannot verify KYC until mandatory PAN, holder name, documents, and bank details are present.",
        missingFields: blockers,
      });
    }

    if (panVerificationStatus) seller.panVerificationStatus = panVerificationStatus;
    if (kycStatus) seller.kycStatus = kycStatus;

    if (seller.panVerificationStatus === "verified" && seller.kycStatus === "verified") {
      seller.onboardingProgress = "kyc_verified";
      if (seller.razorpayAccountStatus === "active") {
        seller.payoutStatus = "enabled";
        seller.linkedAccountOnboardingStatus = "payout_enabled";
      }
    } else {
      seller.payoutStatus = "blocked";
      syncLinkedAccountOnboardingStatus(seller);
    }

    recordComplianceEvent(seller, "admin_kyc_status_update", req.adminUsername || "admin", {
      panVerificationStatus: seller.panVerificationStatus,
      kycStatus: seller.kycStatus,
      note: String(note || "").trim(),
    });

    await seller.save();
    const refreshed = await Seller.findById(seller._id).select(ADMIN_SELLER_OMIT);
    return res.json({ seller: toAdminSellerView(refreshed) });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to update seller KYC status" });
  }
});

router.get("/financial-ledger", adminAuth, async (req, res) => {
  try {
    const ledgers = await TransactionLedger.find({})
      .populate("orderId", "_id customerName amount deliveryCharge")
      .populate("sellerId", "_id businessName slug")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ ledgers });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch financial ledgers" });
  }
});

// ─── ADMIN: Fetch Outgoing Transfers & Statuses ─────────────────────────
router.get("/platform-settings", adminAuth, async (_req, res) => {
  try {
    const commissionPercentage = await getPlatformCommissionPercentage();
    return res.json({ commissionPercentage, commissionMode: "added" });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to fetch platform settings" });
  }
});

router.patch("/platform-settings/commission", adminAuth, async (req, res) => {
  try {
    const rawPercentage = req.body?.commissionPercentage;
    if (!Number.isFinite(Number(rawPercentage))) {
      return res.status(400).json({ message: "Commission percentage must be a number" });
    }

    const commissionPercentage = normalizeCommissionPercentage(rawPercentage);
    if (commissionPercentage < 0 || commissionPercentage > 100) {
      return res.status(400).json({ message: "Commission percentage must be between 0 and 100" });
    }

    const previousPercentage = await getPlatformCommissionPercentage();
    await setPlatformCommissionPercentage(commissionPercentage, req.adminUsername || "admin");

    await AuditLog.create({
      action: "platform_commission_updated",
      actorType: "admin",
      actorId: req.adminUsername || "admin",
      targetType: "platform_setting",
      targetId: "platform_commission_percentage",
      metadata: { previousPercentage, nextPercentage: commissionPercentage },
    });

    return res.json({ commissionPercentage, commissionMode: "added" });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to update platform commission" });
  }
});

router.get("/platform-revenue", adminAuth, async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const createdAt = {};
    if (from && !Number.isNaN(from.getTime())) createdAt.$gte = from;
    if (to && !Number.isNaN(to.getTime())) createdAt.$lte = to;

    const ledgerQuery = { sellerId: null, purpose: "platform_commission", type: "credit" };
    if (Object.keys(createdAt).length > 0) ledgerQuery.createdAt = createdAt;

    const ledgers = await TransactionLedger.find(ledgerQuery)
      .populate({
        path: "orderId",
        select: "_id seller platformFeePaise grossAmountPaise vendorAmountPaise settlementStatus transferStatus createdAt",
        populate: { path: "seller", select: "_id businessName slug" },
      })
      .sort({ createdAt: -1 })
      .limit(500);

    const totalPlatformRevenuePaise = ledgers.reduce(
      (sum, log) => sum + Math.max(0, Number(log.amountPaise) || 0),
      0
    );
    const revenueByVendorMap = new Map();
    const revenueByDateMap = new Map();

    for (const log of ledgers) {
      const seller = log.orderId?.seller;
      const sellerId = seller?._id?.toString?.() || "unknown";
      const vendor = revenueByVendorMap.get(sellerId) || {
        sellerId,
        businessName: seller?.businessName || "Unknown vendor",
        slug: seller?.slug || "",
        revenue: 0,
        orders: 0,
      };
      vendor.revenue += log.amountPaise / 100;
      vendor.orders += 1;
      revenueByVendorMap.set(sellerId, vendor);

      const date = new Date(log.createdAt).toISOString().slice(0, 10);
      revenueByDateMap.set(date, (revenueByDateMap.get(date) || 0) + log.amountPaise / 100);
    }

    const settlementTracking = await Order.aggregate([
      { $match: { paymentMethod: "prepaid" } },
      {
        $group: {
          _id: "$settlementStatus",
          count: { $sum: 1 },
          vendorAmountPaise: { $sum: "$vendorAmountPaise" },
          platformFeePaise: { $sum: "$platformFeePaise" },
        },
      },
    ]);

    return res.json({
      currentCommissionPercentage: await getPlatformCommissionPercentage(),
      totalPlatformRevenue: totalPlatformRevenuePaise / 100,
      revenueByDate: Array.from(revenueByDateMap.entries()).map(([date, revenue]) => ({ date, revenue })),
      revenueByVendor: Array.from(revenueByVendorMap.values()).sort((a, b) => b.revenue - a.revenue),
      settlementTracking: settlementTracking.map((row) => ({
        status: row._id || "unsettled",
        count: row.count,
        vendorAmount: (row.vendorAmountPaise || 0) / 100,
        platformFee: (row.platformFeePaise || 0) / 100,
      })),
      ledgers,
    });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to fetch platform revenue" });
  }
});

router.get("/settlement-logs", adminAuth, async (_req, res) => {
  try {
    const settlements = await Order.find({ paymentMethod: "prepaid" })
      .populate("seller", "_id businessName slug razorpayAccountId razorpayAccountStatus")
      .populate("parentOrder", "_id razorpayPaymentId razorpayOrderId")
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json({ settlements });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to fetch settlement logs" });
  }
});

router.post("/settlements/:orderId/retry", adminAuth, async (req, res) => {
  try {
    const subOrder = await Order.findById(req.params.orderId).populate("parentOrder");
    if (!subOrder) return res.status(404).json({ message: "Order not found" });
    if (hasProcessedTransfer(subOrder)) {
      return res.status(400).json({ message: "Vendor settlement already completed for this order" });
    }
    if (subOrder.paymentStatus !== "paid" && subOrder.paymentStatus !== "delivered") {
      return res.status(400).json({ message: "Transfer can only be retried for paid orders" });
    }

    const paymentId = subOrder.parentOrder?.razorpayPaymentId;
    if (!paymentId) return res.status(400).json({ message: "Order payment has not been captured yet" });

    const seller = await Seller.findById(subOrder.seller);
    if (!seller) return res.status(404).json({ message: "Seller not found" });
    if (!seller.razorpayAccountId || seller.razorpayAccountStatus !== "active" || !isPayoutEligible(seller)) {
      return res.status(400).json({ message: "Seller linked account or KYC is not payout eligible" });
    }

    subOrder.transferStatus = "pending";
    subOrder.settlementStatus = "pending";
    await subOrder.save();

    const result = await executeVendorTransfer(razorpay, { paymentId, seller, subOrder });
    if (!result.skipped) {
      subOrder.transferId = result.transferId;
      subOrder.transferStatus = "processed";
      subOrder.settlementStatus = "processed";
      subOrder.settlementReferenceIds = Array.from(
        new Set([...(subOrder.settlementReferenceIds || []), result.transferId].filter(Boolean))
      );
      await subOrder.save();
      await recordVendorTransferLedger({
        subOrder,
        seller,
        transferId: result.transferId,
        transferAmountPaise: result.transferAmountPaise,
      });
      await recordPlatformCommissionLedger({ subOrder, status: "settled" });
    }

    await AuditLog.create({
      action: "admin_settlement_retry",
      actorType: "admin",
      actorId: req.adminUsername || "admin",
      targetType: "order",
      targetId: String(subOrder._id),
      metadata: {
        razorpayPaymentId: paymentId,
        transferId: subOrder.transferId || result.transferId || "",
        vendorAmountPaise: subOrder.vendorAmountPaise,
      },
    });

    return res.json({ message: "Settlement retry completed", settlement: subOrder });
  } catch (error) {
    return res.status(500).json({ message: "Unable to retry settlement", error: error.message });
  }
});

router.get("/audit-logs", adminAuth, async (_req, res) => {
  try {
    const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(200);
    return res.json({ logs });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to fetch audit logs" });
  }
});

router.get("/transfers", adminAuth, async (req, res) => {
  try {
    const orders = await Order.find({ paymentMethod: "prepaid" })
      .populate("seller", "_id businessName razorpayAccountId")
      .populate("parentOrder", "_id razorpayPaymentId")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ transfers: orders });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch transfers" });
  }
});

router.post("/sellers/:sellerId/linked-account/retry", adminAuth, async (req, res) => {
  let seller;
  try {
    seller = await Seller.findById(req.params.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (seller.approvalStatus !== "approved") {
      return res.status(400).json({ message: "Linked account provisioning requires an approved seller." });
    }

    const blockers = collectLinkedAccountBlockers(seller);
    if (blockers.length > 0) {
      return res.status(400).json({
        message: "Seller KYC is incomplete for Razorpay linked account creation.",
        missingFields: blockers,
      });
    }

    await provisionVendorLinkedAccount(seller, {
      actor: req.adminUsername || "admin",
      force: true,
    });
    await seller.save();

    const refreshed = await Seller.findById(seller._id).select(ADMIN_SELLER_OMIT);
    return res.json({
      message: "Razorpay linked account provisioning completed.",
      seller: toAdminSellerView(refreshed),
    });
  } catch (error) {
    if (seller) {
      await seller.save();
    }
    return res.status(error.statusCode === 400 ? 400 : 502).json({
      message: "Razorpay linked account provisioning failed.",
      detail: error.message,
      missingFields: error.missingFields || [],
    });
  }
});

module.exports = router;
