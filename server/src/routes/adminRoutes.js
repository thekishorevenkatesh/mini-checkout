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
const {
  collectKycIssues,
  recordComplianceEvent,
} = require("../utils/kycCompliance");
const {
  collectLinkedAccountBlockers,
  provisionVendorLinkedAccount,
  syncLinkedAccountOnboardingStatus,
} = require("../utils/razorpayLinkedAccount");

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
