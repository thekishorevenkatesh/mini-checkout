const express = require("express");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");
const { getPolicyContent } = require("../utils/policyDefaults");

const router = express.Router();

function withPolicyDefaults(sellerDoc) {
  if (!sellerDoc) return sellerDoc;

  const seller = sellerDoc.toObject ? sellerDoc.toObject() : sellerDoc;
  return {
    ...seller,
    ...getPolicyContent(seller),
  };
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

    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch store config" });
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

module.exports = router;
