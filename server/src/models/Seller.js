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
    },
    upiId: {
      type: String,
      trim: true,
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
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
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
    // OTP fields (transient — cleared after verification)
    otp: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Seller", sellerSchema);
