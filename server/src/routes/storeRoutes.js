const express = require("express");
const Seller = require("../models/Seller");
const Product = require("../models/Product");
const auth = require("../middleware/auth");
const { getPolicyContent } = require("../utils/policyDefaults");
const { generateOtp, hashOtp, verifyOtp: verifyHashedOtp } = require("../utils/otp");
const { sendOtpEmail } = require("../utils/mailer");
const { collectKycIssues } = require("../utils/kycCompliance");

const router = express.Router();

function withPolicyDefaults(sellerDoc) {
  if (!sellerDoc) return sellerDoc;

  const seller = sellerDoc.toObject ? sellerDoc.toObject() : sellerDoc;
  return {
    ...seller,
    ...getPolicyContent(seller),
  };
}

function getMissingPublishFields(seller) {
  const checks = [
    ["businessName", seller?.businessName],
    ["businessCategory", seller?.businessCategory],
    ["businessAddress", seller?.businessAddress],
    ["upiId", seller?.upiId],
    ["businessLogo", seller?.businessLogo],
    ["whatsappNumber", seller?.whatsappNumber],
    ["callNumber", seller?.callNumber],
    ["idProofUrl", seller?.idProofUrl],
    ["addressProofUrl", seller?.addressProofUrl],
  ];

  const missingProfileFields = checks
    .filter(([, value]) => !String(value || "").trim())
    .map(([field]) => field);
  const missingKycFields = collectKycIssues(seller, {
    requireDocuments: true,
  });

  return [...new Set([...missingProfileFields, ...missingKycFields])];
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function uniqueCategoryTags(tags = []) {
  return [...new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean))];
}

function parseCategoryTags(category = "") {
  return String(category || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renameCategoryTags(tags = [], fromCategory, toCategory) {
  return uniqueCategoryTags(
    tags.map((tag) => (tag === fromCategory ? toCategory : tag))
  );
}

// ─── GET /store/public/:sellerSlug — Full store config (no auth) ──────────
router.get("/public/:sellerSlug", async (req, res) => {
  try {
    const seller = await Seller.findOne({
      slug: req.params.sellerSlug,
    }).select("-otp -otpExpiry");

    if (!seller) {
      return res.status(404).json({ message: "Store not found" });
    }

    if (!seller.storePublished || seller.approvalStatus !== "approved") {
      return res.status(404).json({ message: "Store not found" });
    }

    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch store config" });
  }
});

router.post("/publish", auth, async (req, res) => {
  try {
    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const missingFields = getMissingPublishFields(seller);
    if (missingFields.length > 0) {
      seller.kycStatus = "incomplete";
      seller.payoutStatus = "blocked";
      await seller.save();
      return res.status(400).json({
        message: "Complete your business profile and mandatory PAN KYC before publishing the store.",
        missingFields,
      });
    }

    const hasProducts = await Product.exists({ seller: seller._id });
    if (!hasProducts) {
      return res.status(400).json({
        message: "Add at least one product before publishing the store.",
      });
    }

    seller.approvalStatus = "pending";
    seller.storePublished = false;
    seller.publishRequestedAt = new Date();
    seller.approvedAt = null;
    seller.approvedBy = "";

    await seller.save();
    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to publish store" });
  }
});

// ─── PUT /store/options — Update store options (auth) ─────────────────────
router.put("/options", auth, async (req, res) => {
  try {
    const {
      banners,
      socialLinks,
      whatsappNumber,
      callNumber,
      businessLogo,
      favicon,
      categories,
      defaultDeliveryCharge,
      deliveryMode,
      freeDeliveryThreshold,
      paymentMode,
      privacyPolicy,
      returnRefundPolicy,
      termsAndConditions,
    } = req.body;

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (Array.isArray(banners)) seller.banners = banners;
    if (Array.isArray(socialLinks)) seller.socialLinks = socialLinks;
    if (typeof whatsappNumber === "string")
      seller.whatsappNumber = whatsappNumber.trim();
    if (typeof callNumber === "string") seller.callNumber = callNumber.trim();
    if (typeof businessLogo === "string")
      seller.businessLogo = businessLogo.trim();
    if (typeof favicon === "string") seller.favicon = favicon.trim();
    if (Array.isArray(categories)) seller.categories = categories;
    if (typeof defaultDeliveryCharge === "number" && defaultDeliveryCharge >= 0)
      seller.defaultDeliveryCharge = defaultDeliveryCharge;
    if (deliveryMode === "always_free" || deliveryMode === "flat_rate")
      seller.deliveryMode = deliveryMode;
    if (typeof freeDeliveryThreshold === "number" && freeDeliveryThreshold >= 0)
      seller.freeDeliveryThreshold = freeDeliveryThreshold;
    if (paymentMode === "prepaid_only" || paymentMode === "cod_only" || paymentMode === "both")
      seller.paymentMode = paymentMode;
    if (typeof privacyPolicy === "string") seller.privacyPolicy = privacyPolicy.trim();
    if (typeof returnRefundPolicy === "string") seller.returnRefundPolicy = returnRefundPolicy.trim();
    if (typeof termsAndConditions === "string") seller.termsAndConditions = termsAndConditions.trim();

    await seller.save();
    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update store options" });
  }
});

// Rename a seller product category and sync existing products that use it.
router.patch("/categories/rename", auth, async (req, res) => {
  try {
    const fromCategory = String(req.body.from || "").trim();
    const toCategory = String(req.body.to || "").trim();

    if (!fromCategory || !toCategory) {
      return res.status(400).json({ message: "Both current and new category names are required." });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.categories.includes(fromCategory)) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (fromCategory === toCategory) {
      return res.json({ seller: withPolicyDefaults(seller), updatedProducts: 0 });
    }

    seller.categories = renameCategoryTags(seller.categories, fromCategory, toCategory);
    await seller.save();

    const products = await Product.find({ seller: seller._id });
    let updatedProducts = 0;

    for (const product of products) {
      const currentTags = uniqueCategoryTags([
        ...(Array.isArray(product.categories) ? product.categories : []),
        ...parseCategoryTags(product.category),
      ]);

      if (!currentTags.includes(fromCategory)) {
        continue;
      }

      const nextTags = renameCategoryTags(currentTags, fromCategory, toCategory);
      product.categories = nextTags;
      product.category = nextTags.join(", ");
      await product.save();
      updatedProducts += 1;
    }

    return res.json({ seller: withPolicyDefaults(seller), updatedProducts });
  } catch (error) {
    return res.status(500).json({ message: "Unable to rename category" });
  }
});

// ─── DELETE /store — Delete all store data (products & options reset) ──────
router.delete("/", auth, async (req, res) => {
  return res.status(400).json({
    message: "Store deletion now requires email OTP verification.",
  });
});

router.post("/request-delete-otp", auth, async (req, res) => {
  try {
    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.businessEmail || !isValidEmail(seller.businessEmail)) {
      return res.status(400).json({
        message: "Add a valid business email in your profile before deleting the store.",
      });
    }

    const otp = generateOtp();
    seller.otp = hashOtp(otp);
    seller.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    seller.otpPurpose = "store_delete";
    seller.otpTargetId = "__store__";
    await seller.save();
    await sendOtpEmail(seller.businessEmail, otp, {
      businessName: seller.businessName,
      purpose: "store_delete",
    });

    return res.json({
      message: "A verification OTP has been sent to your business email.",
      email: seller.businessEmail,
    });
  } catch (error) {
    console.error("[request-store-delete-otp error]", error);
    return res.status(500).json({ message: "Unable to send store deletion OTP" });
  }
});

router.post("/confirm-delete", auth, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (
      !seller.otp ||
      !seller.otpExpiry ||
      seller.otpPurpose !== "store_delete" ||
      seller.otpTargetId !== "__store__"
    ) {
      return res.status(400).json({ message: "Request a fresh deletion OTP to continue." });
    }

    if (seller.otpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }

    if (!verifyHashedOtp(String(otp).trim(), seller.otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    await Product.deleteMany({ seller: seller._id });

    seller.banners = [];
    seller.socialLinks = [];
    seller.categories = [];
    seller.deliveryMode = "always_free";
    seller.defaultDeliveryCharge = 0;
    seller.freeDeliveryThreshold = 500;
    seller.paymentMode = "prepaid_only";
    seller.businessLogo = "";
    seller.favicon = "";
    seller.whatsappNumber = "";
    seller.callNumber = "";
    seller.storePublished = false;
    seller.approvalStatus = "draft";
    seller.publishRequestedAt = null;
    seller.approvedAt = null;
    seller.approvedBy = "";
    seller.otp = null;
    seller.otpExpiry = null;
    seller.otpPurpose = null;
    seller.otpTargetId = null;

    await seller.save();
    return res.json({ message: "Store deleted successfully. You can set up again." });
  } catch (error) {
    console.error("[confirm-store-delete error]", error);
    return res.status(500).json({ message: "Unable to delete store" });
  }
});

// ─── DELETE /seller — Delete seller profile completely ────────────────────
router.delete("/seller", auth, async (req, res) => {
  return res.status(400).json({
    message: "Profile deletion now requires email OTP verification.",
  });
});

module.exports = router;
