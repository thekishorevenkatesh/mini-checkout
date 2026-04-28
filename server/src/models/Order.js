const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    productTitle: {
      type: String,
      required: true,
      trim: true,
    },
    productCategory: {
      type: String,
      trim: true,
      default: "",
    },
    productImageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    variantId: {
      type: String,
      trim: true,
      default: "",
    },
    variantTitle: {
      type: String,
      trim: true,
      default: "",
    },
    selectedVariants: {
      type: Map,
      of: String,
      default: {},
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      index: true,
    },
    items: {
      type: [orderItemSchema],
      default: [],
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryAddress: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Selected variant values submitted by customer: { "Size": "M", "Color": "Red" }
    selectedVariants: {
      type: Map,
      of: String,
      default: {},
    },
    paymentMethod: {
      type: String,
      enum: ["prepaid", "cod"],
      default: "prepaid",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "confirmed", "cancelled"],
      default: "pending",
      index: true,
    },
    paymentScreenshotUrl: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
