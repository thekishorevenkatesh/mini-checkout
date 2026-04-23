const express = require("express");
const jwt = require("jsonwebtoken");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");
const { slugify } = require("../utils/slug");
const { generateOtp } = require("../utils/otp");
const { getPolicyContent } = require("../utils/policyDefaults");
// const { sendOtpEmail } = require("../utils/mailer"); // Email disabled for demo

const router = express.Router();

function issueToken(sellerId) {
  return jwt.sign({ sellerId }, process.env.JWT_SECRET || "dev_secret", {
    expiresIn: "7d",
  });
}

function withPolicyDefaults(sellerDoc) {
  if (!sellerDoc) return sellerDoc;

  const seller = sellerDoc.toObject ? sellerDoc.toObject() : sellerDoc;
  return {
    ...seller,
    ...getPolicyContent(seller),
  };
}

async function createUniqueSellerSlug(businessName, ignoreSellerId = null) {
  const base = slugify(businessName) || "seller";
  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await Seller.findOne({ slug: candidate }).select("_id");
    const isCurrentSeller =
      existing && ignoreSellerId && existing._id.toString() === ignoreSellerId;

    if (!existing || isCurrentSeller) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

// ─── POST /auth/send-otp ───────────────────────────────────────────────────
// Accepts phone or email. Generates OTP, sends via email (if email provided).
// For phone-only accounts without email, OTP is returned in response (dev mode).
router.post("/send-otp", async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone && !email) {
      return res
        .status(400)
        .json({ message: "Phone or email is required" });
    }

    const query = phone
      ? { phone: String(phone).trim() }
      : { businessEmail: String(email).trim().toLowerCase() };

    let seller = await Seller.findOne(query);
    const isNew = !seller;

    if (isNew) {
      // Pre-create a placeholder so we can attach the OTP
      if (!phone) {
        return res.status(404).json({
          message: "No account found with this email. Please register first.",
        });
      }
      seller = new Seller({
        slug: await createUniqueSellerSlug(String(phone).trim()),
        businessName: String(phone).trim(), // temp — will be updated on register
        phone: String(phone).trim(),
      });
    }

    const otp = generateOtp();
    // Store plain OTP in DB for demo purposes (visible in MongoDB)
    seller.otp = otp;
    seller.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await seller.save();

    // Email sending disabled for demo — OTP is returned in response & stored in DB
    // const targetEmail = email || seller.businessEmail;
    // if (targetEmail) {
    //   await sendOtpEmail(targetEmail, otp, seller.businessName);
    // }

    return res.json({
      message: "OTP generated (demo mode — email disabled)",
      isNew,
      hasEmail: false,
      otp, // visible for demo; remove this + re-enable email in production
    });
  } catch (error) {
    console.error("[send-otp error]", error);
    return res.status(500).json({
      message: "Could not send OTP",
      detail: error?.message || String(error), // dev-only: remove before going to prod
      code: error?.code,
    });
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, email, otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const query = phone
      ? { phone: String(phone).trim() }
      : { businessEmail: String(email).trim().toLowerCase() };

    const seller = await Seller.findOne(query);

    if (!seller || !seller.otp || !seller.otpExpiry) {
      return res
        .status(400)
        .json({ message: "No OTP requested. Please request a new OTP." });
    }

    if (seller.otpExpiry < new Date()) {
      return res
        .status(400)
        .json({ message: "OTP expired. Please request a new one." });
    }

    // Plain comparison for demo (no hashing)
    if (String(otp).trim() !== String(seller.otp).trim()) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    // Clear OTP
    seller.otp = null;
    seller.otpExpiry = null;
    await seller.save();

    const isProfileComplete = Boolean(
      seller.businessName && seller.upiId && seller.slug &&
      seller.businessName !== seller.phone // not a placeholder
    );

    if (isProfileComplete && seller.approvalStatus !== "approved") {
      return res.status(403).json({
        message:
          seller.approvalStatus === "rejected"
            ? "Your seller account was rejected by admin. Please contact support."
            : "Your account is pending admin approval. You can login after approval.",
        approvalStatus: seller.approvalStatus,
      });
    }

    const token = issueToken(seller._id.toString());
    return res.json({ token, seller: withPolicyDefaults(seller), isProfileComplete });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Could not verify OTP" });
  }
});

// ─── POST /auth/register ──────────────────────────────────────────────────
// Called after OTP verification for new sellers to complete their profile
router.post("/register", auth, async (req, res) => {
  try {
    const {
      businessName,
      businessEmail,
      businessAddress,
      businessGST,
      upiId,
      businessLogo,
      whatsappNumber,
      callNumber,
      termsAccepted,
      privacyPolicy,
      returnRefundPolicy,
      termsAndConditions,
    } = req.body;

    if (!businessName) {
      return res.status(400).json({ message: "Business name is required" });
    }

    if (!termsAccepted) {
      return res.status(400).json({ message: "You must accept Terms & Conditions." });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    seller.businessName = String(businessName).trim();
    seller.slug = await createUniqueSellerSlug(
      seller.businessName,
      seller._id.toString()
    );

    if (businessEmail) seller.businessEmail = String(businessEmail).trim().toLowerCase();
    if (businessAddress) seller.businessAddress = String(businessAddress).trim();
    if (businessGST) seller.businessGST = String(businessGST).trim();
    if (upiId) seller.upiId = String(upiId).trim();
    if (businessLogo) seller.businessLogo = String(businessLogo).trim();
    if (whatsappNumber) seller.whatsappNumber = String(whatsappNumber).trim();
    if (callNumber) seller.callNumber = String(callNumber).trim();
    if (typeof privacyPolicy === "string") seller.privacyPolicy = privacyPolicy.trim();
    if (typeof returnRefundPolicy === "string") seller.returnRefundPolicy = returnRefundPolicy.trim();
    if (typeof termsAndConditions === "string") seller.termsAndConditions = termsAndConditions.trim();
    seller.approvalStatus = "pending";
    seller.approvedAt = null;
    seller.approvedBy = "";
    seller.termsAcceptedAt = new Date();

    await seller.save();
    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Could not complete registration" });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────
router.get("/me", auth, async (req, res) => {
  try {
    const seller = await Seller.findById(req.sellerId).select("-otp -otpExpiry");

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.slug) {
      seller.slug = await createUniqueSellerSlug(
        seller.businessName,
        seller._id.toString()
      );
      await seller.save();
    }

    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch profile" });
  }
});

// ─── PUT /auth/me ─────────────────────────────────────────────────────────
router.put("/me", auth, async (req, res) => {
  try {
    const {
      businessName,
      businessEmail,
      businessAddress,
      businessGST,
      upiId,
      profileImageUrl,
      businessLogo,
      favicon,
      whatsappNumber,
      callNumber,
      privacyPolicy,
      returnRefundPolicy,
      termsAndConditions,
    } = req.body;

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (businessName) seller.businessName = String(businessName).trim();
    if (businessEmail) seller.businessEmail = String(businessEmail).trim().toLowerCase();
    if (businessAddress !== undefined) seller.businessAddress = String(businessAddress).trim();
    if (businessGST !== undefined) seller.businessGST = String(businessGST).trim();
    if (typeof upiId === "string") seller.upiId = upiId.trim();
    if (typeof profileImageUrl === "string") seller.profileImageUrl = profileImageUrl.trim();
    if (typeof businessLogo === "string") seller.businessLogo = businessLogo.trim();
    if (typeof favicon === "string") seller.favicon = favicon.trim();
    if (typeof whatsappNumber === "string") seller.whatsappNumber = whatsappNumber.trim();
    if (typeof callNumber === "string") seller.callNumber = callNumber.trim();
    if (typeof privacyPolicy === "string") seller.privacyPolicy = privacyPolicy.trim();
    if (typeof returnRefundPolicy === "string") seller.returnRefundPolicy = returnRefundPolicy.trim();
    if (typeof termsAndConditions === "string") seller.termsAndConditions = termsAndConditions.trim();

    if (!seller.slug) {
      seller.slug = await createUniqueSellerSlug(
        seller.businessName,
        seller._id.toString()
      );
    }

    await seller.save();
    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update profile" });
  }
});

module.exports = router;
