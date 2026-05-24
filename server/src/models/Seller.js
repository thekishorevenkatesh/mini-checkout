const mongoose = require("mongoose");
const { DEFAULT_POLICY_CONTENT } = require("../utils/policyDefaults");

const socialLinkSchema = new mongoose.Schema(
  {
    platform: { type: String, trim: true },
    url: { type: String, trim: true },
  },
  { _id: false }
);

const bannerSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, trim: true },
    title: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const sellerSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessCategory: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    businessEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },
    upiId: {
      type: String,
      trim: true,
      default: "",
    },
    bankAccountName: {
      type: String,
      trim: true,
      default: "",
    },
    bankName: {
      type: String,
      trim: true,
      default: "",
    },
    bankAccountNumber: {
      type: String,
      trim: true,
      default: "",
    },
    bankIfsc: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    businessAddress: {
      type: String,
      trim: true,
      default: "",
    },
    businessGST: {
      type: String,
      trim: true,
      default: "",
    },
    pan: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    panHash: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    panHolderName: {
      type: String,
      trim: true,
      default: "",
    },
    panDocumentUrl: {
      type: String,
      trim: true,
      default: "",
    },
    panVerificationStatus: {
      type: String,
      enum: ["unsubmitted", "pending", "verified", "rejected"],
      default: "unsubmitted",
      index: true,
    },
    kycStatus: {
      type: String,
      enum: ["incomplete", "pending", "verified", "rejected"],
      default: "incomplete",
      index: true,
    },
    onboardingProgress: {
      type: String,
      enum: ["otp_verified", "profile_submitted", "kyc_pending", "kyc_verified", "approved"],
      default: "otp_verified",
      index: true,
    },
    payoutStatus: {
      type: String,
      enum: ["blocked", "enabled", "suspended"],
      default: "blocked",
      index: true,
    },
    profileImageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    businessLogo: {
      type: String,
      trim: true,
      default: "",
    },
    favicon: {
      type: String,
      trim: true,
      default: "",
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: "",
    },
    callNumber: {
      type: String,
      trim: true,
      default: "",
    },
    idProofUrl: {
      type: String,
      trim: true,
      default: "",
    },
    addressProofUrl: {
      type: String,
      trim: true,
      default: "",
    },
    socialLinks: {
      type: [socialLinkSchema],
      default: [],
    },
    banners: {
      type: [bannerSchema],
      default: [],
    },
    categories: {
      type: [String],
      default: [],
    },
    defaultDeliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryMode: {
      type: String,
      enum: ["always_free", "flat_rate"],
      default: "always_free",
    },
    freeDeliveryThreshold: {
      type: Number,
      default: 500,
      min: 0,
    },
    paymentMode: {
      type: String,
      enum: ["prepaid_only", "cod_only", "both"],
      default: "prepaid_only",
    },
    privacyPolicy: {
      type: String,
      trim: true,
      default: DEFAULT_POLICY_CONTENT.privacyPolicy,
    },
    returnRefundPolicy: {
      type: String,
      trim: true,
      default: DEFAULT_POLICY_CONTENT.returnRefundPolicy,
    },
    termsAndConditions: {
      type: String,
      trim: true,
      default: DEFAULT_POLICY_CONTENT.termsAndConditions,
    },
    approvalStatus: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "suspended"],
      default: "draft",
      index: true,
    },
    razorpayAccountId: {
      type: String,
      default: "",
    },
    razorpayAccountStatus: {
      type: String,
      enum: ["uncreated", "pending", "active", "suspended"],
      default: "uncreated",
    },
    kycDetailsEncrypted: {
      pan: { type: String, default: "" },
      panHolderName: { type: String, default: "" },
      gst: { type: String, default: "" },
      bankAccountName: { type: String, default: "" },
      bankAccountNumber: { type: String, default: "" },
      bankName: { type: String, default: "" },
      bankIfsc: { type: String, default: "" },
      businessType: { type: String, default: "individual" },
      businessCategory: { type: String, default: "" },
    },
    commissionConfig: {
      commissionType: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage",
      },
      commissionValue: {
        type: Number,
        default: 5, // Default 5% commission
      },
      categoryCommissions: {
        type: Map,
        of: Number,
        default: {},
      },
    },
    storePublished: {
      type: Boolean,
      default: false,
    },
    publishRequestedAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: String,
      trim: true,
      default: "",
    },
    termsAcceptedAt: {
      type: Date,
      default: null,
    },
    complianceAudit: {
      type: [
        {
          action: { type: String, trim: true, required: true },
          actor: { type: String, trim: true, default: "system" },
          metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // OTP fields (transient — cleared after verification)
    otp: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    otpPurpose: {
      type: String,
      enum: ["auth", "profile_delete", "product_delete", "store_delete"],
      default: null,
    },
    otpTargetId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

sellerSchema.index(
  { panHash: 1 },
  {
    unique: true,
    partialFilterExpression: { panHash: { $type: "string", $gt: "" } },
  }
);
sellerSchema.index({ kycStatus: 1, payoutStatus: 1, approvalStatus: 1 });

module.exports = mongoose.model("Seller", sellerSchema);
