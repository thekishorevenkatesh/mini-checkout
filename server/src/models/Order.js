const mongoose = require("mongoose");

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
      required: true,
      index: true,
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
      min: 1,
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
