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
const {
  applyKycStateFromPan,
  collectKycIssues,
  getPanCompliance,
  isValidPan,
  maskPan,
  normalizePan,
  panHash,
  recordComplianceEvent,
} = require("../utils/kycCompliance");

const router = express.Router();

function issueToken(sellerId) {
  return jwt.sign({ sellerId }, process.env.JWT_SECRET || "dev_secret", {
    expiresIn: "7d",
  });
}

function withPolicyDefaults(sellerDoc) {
  if (!sellerDoc) return sellerDoc;

  const seller = sellerDoc.toObject ? sellerDoc.toObject() : sellerDoc;
  const pan = getPanCompliance(seller);
  const businessType = seller.kycDetailsEncrypted?.businessType || seller.businessType || "individual";
  delete seller.kycDetailsEncrypted;
  return {
    ...seller,
    pan: pan.panMasked || seller.pan || "",
    businessType,
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
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return raw;
  if (digits.length > 10 && digits.startsWith("91")) {
    return digits.slice(-10);
  }

  return digits;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatAddressParts(parts) {
  if (!parts || typeof parts !== "object" || Array.isArray(parts)) return "";

  return [
    parts.line1,
    parts.line2,
    parts.landmark,
    parts.city,
    parts.state,
    parts.country,
    parts.pincode,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function resolveAddressString(address, addressParts) {
  const formattedParts = formatAddressParts(addressParts);
  const nextAddress = String(address || "").trim();

  if (!nextAddress) return formattedParts;

  const pincode = String(addressParts?.pincode || "").replace(/\D/g, "");
  if (pincode && !new RegExp(`\\b${pincode}\\b`).test(nextAddress)) {
    return formattedParts || nextAddress;
  }

  return nextAddress;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPhoneLookupValues(normalizedPhone) {
  return Array.from(
    new Set([
      normalizedPhone,
      `+91 ${normalizedPhone}`,
      `+91${normalizedPhone}`,
      `91${normalizedPhone}`,
    ].filter(Boolean))
  );
}

function phoneMatches(value, normalizedPhone) {
  return normalizePhone(value) === normalizedPhone;
}

function hasCompletedSellerProfile(seller, normalizedPhone) {
  const businessName = String(seller?.businessName || "").trim();
  if (!businessName) return false;

  return normalizePhone(businessName) !== normalizedPhone;
}

async function findSellerByPhone(normalizedPhone) {
  return Seller.findOne({ phone: { $in: getPhoneLookupValues(normalizedPhone) } });
}

async function findSellerByEmail(normalizedEmail) {
  return (
    (await Seller.findOne({ businessEmail: normalizedEmail })) ||
    Seller.findOne({ businessEmail: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, "i") })
  );
}

async function findSellerByPhoneAndEmail(normalizedPhone, normalizedEmail) {
  const seller = await Seller.findOne({
    phone: { $in: getPhoneLookupValues(normalizedPhone) },
    businessEmail: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, "i"),
  });

  if (seller) return seller;

  const sellerWithEmail = await findSellerByEmail(normalizedEmail);
  if (sellerWithEmail && phoneMatches(sellerWithEmail.phone, normalizedPhone)) {
    return sellerWithEmail;
  }

  return null;
}

async function storeAndSendOtp({ seller, email, purpose, targetId = null, intent = "" }) {
  const otp = generateOtp();
  seller.otp = hashOtp(otp);
  seller.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  seller.otpPurpose = purpose;
  seller.otpTargetId = targetId;
  await seller.save();
  await sendOtpEmail(email, otp, {
    businessName: seller.businessName,
    purpose,
    intent,
  });
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
      seller = await findSellerByPhoneAndEmail(normalizedPhone, normalizedEmail);

      if (!seller) {
        return res.status(404).json({
          message: "No account found with this phone and email combination. Please register first.",
          redirectTo: "register",
        });
      }
    } else {
      const existingByPhone = await findSellerByPhone(normalizedPhone);
      const existingByEmail = await findSellerByEmail(normalizedEmail);

      if (existingByEmail && !phoneMatches(existingByEmail.phone, normalizedPhone)) {
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
      } else if (normalizeEmail(seller.businessEmail) !== normalizedEmail) {
        return res.status(409).json({
          message: "This phone number is already linked to a different email address.",
        });
      }
    }

    await storeAndSendOtp({
      seller,
      email: normalizedEmail,
      purpose: "auth",
      intent: normalizedIntent === "login" ? "login" : "register",
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

    const seller = await findSellerByPhoneAndEmail(normalizedPhone, normalizedEmail);

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

    const isProfileComplete = hasCompletedSellerProfile(seller, normalizedPhone);

    const token = issueToken(seller._id.toString());
    return res.json({ token, seller: withPolicyDefaults(seller), isProfileComplete });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Could not verify OTP" });
  }
});

const { encrypt, decrypt } = require("../utils/encryption");
const TransactionLedger = require("../models/TransactionLedger");

function maskText(text, visibleCount = 4) {
  if (!text) return "";
  const clean = String(text).trim();
  if (clean.length <= visibleCount) return "*".repeat(clean.length);
  return "*".repeat(clean.length - visibleCount) + clean.slice(-visibleCount);
}

async function assertPanIsUnique(normalizedPan, sellerId) {
  const duplicate = await Seller.findOne({
    panHash: panHash(normalizedPan),
    _id: { $ne: sellerId },
  }).select("_id");

  if (duplicate) {
    const error = new Error("This PAN is already linked to another seller account.");
    error.statusCode = 409;
    throw error;
  }
}

// ─── POST /auth/register ──────────────────────────────────────────────────
// Called after OTP verification for new sellers to complete their profile
router.post("/register", auth, async (req, res) => {
  try {
    const {
      businessName,
      businessCategory,
      businessEmail,
      businessAddress,
      businessAddressParts,
      businessGST,
      upiId,
      bankAccountName,
      bankName,
      bankAccountNumber,
      bankIfsc,
      pan,
      panHolderName,
      panDocumentUrl,
      businessType = "individual",
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

    const normalizedPan = normalizePan(pan);
    const normalizedPanHolderName = String(panHolderName || businessName || "").trim();
    if (!normalizedPan) {
      return res.status(400).json({ message: "PAN number is mandatory for vendor onboarding." });
    }
    if (!isValidPan(normalizedPan)) {
      return res.status(400).json({ message: "Enter a valid PAN in ABCDE1234F format." });
    }
    if (!normalizedPanHolderName) {
      return res.status(400).json({ message: "PAN holder legal name is required." });
    }

    const formattedAddress = resolveAddressString(businessAddress, businessAddressParts);
    if (!formattedAddress) {
      return res.status(400).json({ message: "Business address is required." });
    }

    const normalizedPanDocumentUrl = String(panDocumentUrl || "").trim();
    if (!normalizedPanDocumentUrl) {
      return res.status(400).json({ message: "PAN document upload is required." });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }
    await assertPanIsUnique(normalizedPan, seller._id);

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
    seller.businessAddress = formattedAddress;
    if (upiId) seller.upiId = String(upiId).trim();
    if (bankName) seller.bankName = String(bankName).trim();
    if (bankIfsc) seller.bankIfsc = String(bankIfsc).trim().toUpperCase();
    if (businessLogo) seller.businessLogo = String(businessLogo).trim();
    if (whatsappNumber) seller.whatsappNumber = String(whatsappNumber).trim();
    if (callNumber) seller.callNumber = String(callNumber).trim();
    if (typeof idProofUrl === "string") seller.idProofUrl = idProofUrl.trim();
    if (typeof addressProofUrl === "string") seller.addressProofUrl = addressProofUrl.trim();
    if (typeof privacyPolicy === "string") seller.privacyPolicy = privacyPolicy.trim();
    if (typeof returnRefundPolicy === "string") seller.returnRefundPolicy = returnRefundPolicy.trim();
    if (typeof termsAndConditions === "string") seller.termsAndConditions = termsAndConditions.trim();
    
    // Cryptographic Storage for sensitive details
    if (!seller.kycDetailsEncrypted) {
      seller.kycDetailsEncrypted = {};
    }
    
    if (bankAccountName) {
      seller.kycDetailsEncrypted.bankAccountName = encrypt(bankAccountName);
      seller.bankAccountName = maskText(bankAccountName, 3);
    }
    if (bankAccountNumber) {
      seller.kycDetailsEncrypted.bankAccountNumber = encrypt(bankAccountNumber);
      seller.bankAccountNumber = maskText(bankAccountNumber, 4);
    }
    seller.kycDetailsEncrypted.pan = encrypt(normalizedPan);
    seller.kycDetailsEncrypted.panHolderName = encrypt(normalizedPanHolderName);
    seller.pan = maskPan(normalizedPan);
    seller.panHash = panHash(normalizedPan);
    seller.panHolderName = normalizedPanHolderName;
    seller.panDocumentUrl = normalizedPanDocumentUrl;
    if (businessGST) {
      seller.kycDetailsEncrypted.gst = encrypt(businessGST);
      seller.businessGST = maskText(businessGST, 4);
    }
    
    seller.kycDetailsEncrypted.bankIfsc = seller.bankIfsc;
    seller.kycDetailsEncrypted.bankName = seller.bankName;
    seller.kycDetailsEncrypted.businessType = businessType;
    seller.kycDetailsEncrypted.businessCategory = businessCategory || "";

    seller.approvalStatus = "draft";
    seller.storePublished = false;
    seller.onboardingProgress = "profile_submitted";
    applyKycStateFromPan(seller);
    recordComplianceEvent(seller, "vendor_registration_pan_submitted", "seller", {
      panVerificationStatus: seller.panVerificationStatus,
      kycStatus: seller.kycStatus,
    });
    seller.publishRequestedAt = null;
    seller.approvedAt = null;
    seller.approvedBy = "";
    seller.termsAcceptedAt = new Date();

    await seller.save();
    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    console.error(error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.code === 11000 && error.keyPattern?.panHash) {
      return res.status(409).json({ message: "This PAN is already linked to another seller account." });
    }
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
      businessAddressParts,
      businessGST,
      upiId,
      bankAccountName,
      bankName,
      bankAccountNumber,
      bankIfsc,
      pan,
      panHolderName,
      panDocumentUrl,
      businessType,
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

    const nextBusinessEmail = normalizeEmail(businessEmail || seller.businessEmail);

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
    if (businessAddress !== undefined || businessAddressParts !== undefined) {
      seller.businessAddress = resolveAddressString(businessAddress, businessAddressParts);
    }
    if (typeof upiId === "string") seller.upiId = upiId.trim();
    if (typeof bankName === "string") seller.bankName = bankName.trim();
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

    // Secure cryptographic updates for KYC & bank details
    if (!seller.kycDetailsEncrypted) {
      seller.kycDetailsEncrypted = {};
    }

    if (typeof bankAccountName === "string" && bankAccountName.trim()) {
      if (!bankAccountName.includes("*")) { // Only encrypt if it's a new raw value
        seller.kycDetailsEncrypted.bankAccountName = encrypt(bankAccountName);
        seller.bankAccountName = maskText(bankAccountName, 3);
      }
    }
    if (typeof bankAccountNumber === "string" && bankAccountNumber.trim()) {
      if (!bankAccountNumber.includes("*")) { // Only encrypt if it's a new raw value
        seller.kycDetailsEncrypted.bankAccountNumber = encrypt(bankAccountNumber);
        seller.bankAccountNumber = maskText(bankAccountNumber, 4);
      }
    }
    const existingPan = getPanCompliance(seller);
    const nextRawPan = typeof pan === "string" && !pan.includes("*")
      ? normalizePan(pan)
      : existingPan.pan;
    const nextPanHolderName = typeof panHolderName === "string"
      ? panHolderName.trim()
      : seller.panHolderName;

    if (!nextRawPan) {
      return res.status(400).json({ message: "PAN number is mandatory for vendor onboarding." });
    }
    if (!isValidPan(nextRawPan)) {
      return res.status(400).json({ message: "Enter a valid PAN in ABCDE1234F format." });
    }
    if (!nextPanHolderName) {
      return res.status(400).json({ message: "PAN holder legal name is required." });
    }

    if (nextRawPan !== existingPan.pan) {
      await assertPanIsUnique(nextRawPan, seller._id);
      seller.kycDetailsEncrypted.pan = encrypt(nextRawPan);
      seller.pan = maskPan(nextRawPan);
      seller.panHash = panHash(nextRawPan);
      seller.panVerificationStatus = "pending";
      seller.kycStatus = "pending";
      seller.payoutStatus = "blocked";
      if (seller.razorpayAccountStatus === "active") {
        seller.razorpayAccountStatus = "suspended";
      }
      recordComplianceEvent(seller, "pan_changed_reverification_required", "seller");
    }
    seller.panHolderName = nextPanHolderName;
    seller.kycDetailsEncrypted.panHolderName = encrypt(nextPanHolderName);
    if (typeof panDocumentUrl === "string") seller.panDocumentUrl = panDocumentUrl.trim();
    if (typeof businessGST === "string" && businessGST.trim()) {
      if (!businessGST.includes("*")) { // Only encrypt if it's a new raw value
        seller.kycDetailsEncrypted.gst = encrypt(businessGST);
        seller.businessGST = maskText(businessGST, 4);
      }
    }

    if (businessType) seller.kycDetailsEncrypted.businessType = businessType;
    if (businessCategory) seller.kycDetailsEncrypted.businessCategory = businessCategory;
    seller.kycDetailsEncrypted.bankIfsc = seller.bankIfsc;
    seller.kycDetailsEncrypted.bankName = seller.bankName;
    applyKycStateFromPan(seller);
    const kycIssues = collectKycIssues(seller);
    seller.onboardingProgress = kycIssues.length ? "kyc_pending" : "profile_submitted";

    if (!seller.slug) {
      seller.slug = await createUniqueSellerSlug(
        seller.businessName,
        seller._id.toString()
      );
    }

    await seller.save();
    return res.json({ seller: withPolicyDefaults(seller) });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.code === 11000 && error.keyPattern?.panHash) {
      return res.status(409).json({ message: "This PAN is already linked to another seller account." });
    }
    return res.status(500).json({ message: "Unable to update profile" });
  }
});

// ─── GET /auth/earnings ──────────────────────────────────────────────────
// Returns the seller's sales, ledger logs, and settlement breakdowns
router.get("/earnings", auth, async (req, res) => {
  try {
    const ledgers = await TransactionLedger.find({ sellerId: req.sellerId })
      .populate("orderId", "_id customerName createdAt amount deliveryCharge")
      .sort({ createdAt: -1 });

    let grossRevenuePaise = 0;
    let netEarningsPaise = 0;
    let deliveryFeesPaise = 0;
    let reversalsPaise = 0;

    for (const log of ledgers) {
      if (log.type === "credit") {
        if (log.purpose === "order_item_revenue") {
          grossRevenuePaise += log.amountPaise;
          netEarningsPaise += log.amountPaise;
        } else if (log.purpose === "delivery_fee") {
          deliveryFeesPaise += log.amountPaise;
          netEarningsPaise += log.amountPaise;
        }
      } else if (log.type === "debit") {
        reversalsPaise += log.amountPaise;
        netEarningsPaise -= log.amountPaise;
      }
    }

    return res.json({
      summary: {
        grossRevenue: grossRevenuePaise / 100,
        netEarnings: netEarningsPaise / 100,
        deliveryFees: deliveryFeesPaise / 100,
        reversals: reversalsPaise / 100,
        refunds: reversalsPaise / 100,
        settlementModel: "direct",
      },
      ledger: ledgers,
    });
  } catch (error) {
    console.error("[Get Earnings Error]:", error);
    return res.status(500).json({ message: "Unable to fetch seller financial metrics" });
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
