const express = require("express");
const jwt = require("jsonwebtoken");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");
const { slugify } = require("../utils/slug");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { generateOtp, hashOtp, verifyOtp: verifyHashedOtp } = require("../utils/otp");
const { getPolicyContent } = require("../utils/policyDefaults");
const { sendOtpEmail } = require("../utils/mailer");

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

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function storeAndSendOtp({ seller, email, purpose, targetId = null }) {
  const otp = generateOtp();
  seller.otp = hashOtp(otp);
  seller.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  seller.otpPurpose = purpose;
  seller.otpTargetId = targetId;
  await seller.save();
  await sendOtpEmail(email, otp, seller.businessName);
}

// ─── POST /auth/send-otp ───────────────────────────────────────────────────
// Email is mandatory and used as the OTP destination.
router.post("/send-otp", async (req, res) => {
  try {
    const { phone, email, intent } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedPhone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email address is required" });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    let seller = null;
    const normalizedIntent = String(intent || "").trim();

    if (normalizedIntent === "login") {
      seller = await Seller.findOne({
        phone: normalizedPhone,
        businessEmail: normalizedEmail,
      });

      if (!seller) {
        return res.status(404).json({
          message: "No account found with this phone and email combination. Please register first.",
          redirectTo: "register",
        });
      }
    } else {
      const existingByPhone = await Seller.findOne({ phone: normalizedPhone });
      const existingByEmail = await Seller.findOne({ businessEmail: normalizedEmail });

      if (existingByEmail && existingByEmail.phone !== normalizedPhone) {
        return res.status(409).json({
          message: "This email address is already linked to another account.",
        });
      }

      seller = existingByPhone || existingByEmail;

      if (!seller) {
        seller = new Seller({
          slug: await createUniqueSellerSlug(normalizedPhone),
          businessName: normalizedPhone,
          phone: normalizedPhone,
          businessEmail: normalizedEmail,
        });
      } else if (!seller.businessEmail) {
        seller.businessEmail = normalizedEmail;
      } else if (seller.businessEmail !== normalizedEmail) {
        return res.status(409).json({
          message: "This phone number is already linked to a different email address.",
        });
      }
    }

    await storeAndSendOtp({
      seller,
      email: normalizedEmail,
      purpose: "auth",
    });

    return res.json({
      message: "OTP sent to your email address.",
      isNew: normalizedIntent !== "login" && seller.businessName === normalizedPhone,
      hasEmail: true,
    });
  } catch (error) {
    console.error("[send-otp error]", error);
    return res.status(500).json({
      message: "Could not send OTP",
    });
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, email, otp } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }
    if (!normalizedPhone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email address is required" });
    }

    const seller = await Seller.findOne({
      phone: normalizedPhone,
      businessEmail: normalizedEmail,
    });

    if (!seller || !seller.otp || !seller.otpExpiry || seller.otpPurpose !== "auth") {
      return res
        .status(400)
        .json({ message: "No OTP requested. Please request a new OTP." });
    }

    if (seller.otpExpiry < new Date()) {
      return res
        .status(400)
        .json({ message: "OTP expired. Please request a new one." });
    }

    if (!verifyHashedOtp(String(otp).trim(), seller.otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    seller.otp = null;
    seller.otpExpiry = null;
    seller.otpPurpose = null;
    seller.otpTargetId = null;
    await seller.save();

    const isProfileComplete = Boolean(
      seller.businessName && seller.upiId && seller.slug &&
      seller.businessName !== seller.phone // not a placeholder
    );

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
      businessCategory,
      businessEmail,
      businessAddress,
      businessGST,
      upiId,
      bankAccountName,
      bankName,
      bankAccountNumber,
      bankIfsc,
      businessLogo,
      whatsappNumber,
      callNumber,
      idProofUrl,
      addressProofUrl,
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

    const nextBusinessEmail = normalizeEmail(businessEmail || seller.businessEmail);
    if (!nextBusinessEmail) {
      return res.status(400).json({ message: "Business email is required" });
    }
    if (!isValidEmail(nextBusinessEmail)) {
      return res.status(400).json({ message: "Enter a valid business email address" });
    }

    const duplicateSeller = await Seller.findOne({
      businessEmail: nextBusinessEmail,
      _id: { $ne: seller._id },
    }).select("_id");
    if (duplicateSeller) {
      return res.status(409).json({ message: "This email address is already linked to another account." });
    }

    seller.businessName = String(businessName).trim();
    if (businessCategory) seller.businessCategory = String(businessCategory).trim();
    seller.slug = await createUniqueSellerSlug(
      seller.businessName,
      seller._id.toString()
    );

    seller.businessEmail = nextBusinessEmail;
    if (businessAddress) seller.businessAddress = String(businessAddress).trim();
    if (businessGST) seller.businessGST = String(businessGST).trim();
    if (upiId) seller.upiId = String(upiId).trim();
    if (bankAccountName) seller.bankAccountName = String(bankAccountName).trim();
    if (bankName) seller.bankName = String(bankName).trim();
    if (bankAccountNumber) seller.bankAccountNumber = String(bankAccountNumber).trim();
    if (bankIfsc) seller.bankIfsc = String(bankIfsc).trim().toUpperCase();
    if (businessLogo) seller.businessLogo = String(businessLogo).trim();
    if (whatsappNumber) seller.whatsappNumber = String(whatsappNumber).trim();
    if (callNumber) seller.callNumber = String(callNumber).trim();
    if (typeof idProofUrl === "string") seller.idProofUrl = idProofUrl.trim();
    if (typeof addressProofUrl === "string") seller.addressProofUrl = addressProofUrl.trim();
    if (typeof privacyPolicy === "string") seller.privacyPolicy = privacyPolicy.trim();
    if (typeof returnRefundPolicy === "string") seller.returnRefundPolicy = returnRefundPolicy.trim();
    if (typeof termsAndConditions === "string") seller.termsAndConditions = termsAndConditions.trim();
    seller.approvalStatus = "draft";
    seller.storePublished = false;
    seller.publishRequestedAt = null;
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
      businessCategory,
      businessEmail,
      businessAddress,
      businessGST,
      upiId,
      bankAccountName,
      bankName,
      bankAccountNumber,
      bankIfsc,
      profileImageUrl,
      businessLogo,
      favicon,
      whatsappNumber,
      callNumber,
      idProofUrl,
      addressProofUrl,
      privacyPolicy,
      returnRefundPolicy,
      termsAndConditions,
    } = req.body;

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const nextBusinessEmail = normalizeEmail(businessEmail);

    if (businessName) seller.businessName = String(businessName).trim();
    if (businessCategory !== undefined) seller.businessCategory = String(businessCategory).trim();
    if (!nextBusinessEmail) {
      return res.status(400).json({ message: "Business email is required" });
    }
    if (!isValidEmail(nextBusinessEmail)) {
      return res.status(400).json({ message: "Enter a valid business email address" });
    }

    const duplicateSeller = await Seller.findOne({
      businessEmail: nextBusinessEmail,
      _id: { $ne: seller._id },
    }).select("_id");
    if (duplicateSeller) {
      return res.status(409).json({ message: "This email address is already linked to another account." });
    }

    seller.businessEmail = nextBusinessEmail;
    if (businessAddress !== undefined) seller.businessAddress = String(businessAddress).trim();
    if (businessGST !== undefined) seller.businessGST = String(businessGST).trim();
    if (typeof upiId === "string") seller.upiId = upiId.trim();
    if (typeof bankAccountName === "string") seller.bankAccountName = bankAccountName.trim();
    if (typeof bankName === "string") seller.bankName = bankName.trim();
    if (typeof bankAccountNumber === "string") seller.bankAccountNumber = bankAccountNumber.trim();
    if (typeof bankIfsc === "string") seller.bankIfsc = bankIfsc.trim().toUpperCase();
    if (typeof profileImageUrl === "string") seller.profileImageUrl = profileImageUrl.trim();
    if (typeof businessLogo === "string") seller.businessLogo = businessLogo.trim();
    if (typeof favicon === "string") seller.favicon = favicon.trim();
    if (typeof whatsappNumber === "string") seller.whatsappNumber = whatsappNumber.trim();
    if (typeof callNumber === "string") seller.callNumber = callNumber.trim();
    if (typeof idProofUrl === "string") seller.idProofUrl = idProofUrl.trim();
    if (typeof addressProofUrl === "string") seller.addressProofUrl = addressProofUrl.trim();
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

router.post("/request-delete-otp", auth, async (req, res) => {
  try {
    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.businessEmail || !isValidEmail(seller.businessEmail)) {
      return res.status(400).json({
        message: "Add a valid business email in your profile before deleting the account.",
      });
    }

    await storeAndSendOtp({
      seller,
      email: seller.businessEmail,
      purpose: "profile_delete",
    });

    return res.json({
      message: "A verification OTP has been sent to your business email.",
      email: seller.businessEmail,
    });
  } catch (error) {
    console.error("[request-delete-otp error]", error);
    return res.status(500).json({ message: "Could not send deletion OTP" });
  }
});

router.post("/delete-account", auth, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.otp || !seller.otpExpiry || seller.otpPurpose !== "profile_delete") {
      return res.status(400).json({ message: "Request a fresh deletion OTP to continue." });
    }

    if (seller.otpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }

    if (!verifyHashedOtp(String(otp).trim(), seller.otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    await Product.deleteMany({ seller: seller._id });
    await Order.deleteMany({ seller: seller._id });
    await Seller.deleteOne({ _id: seller._id });

    return res.json({ message: "Profile deleted successfully." });
  } catch (error) {
    console.error("[delete-account error]", error);
    return res.status(500).json({ message: "Unable to delete profile" });
  }
});

module.exports = router;
