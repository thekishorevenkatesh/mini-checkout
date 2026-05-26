const mongoose = require("mongoose");

const parentOrderSchema = new mongoose.Schema(
  {
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      default: "",
      trim: true,
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
      required: true,
      trim: true,
    },
    billingAddress: {
      type: String,
      trim: true,
      default: "",
    },
    shippingAddress: {
      type: String,
      trim: true,
      default: "",
    },
    shippingSameAsBilling: {
      type: Boolean,
      default: true,
    },
    shippingCustomerName: {
      type: String,
      trim: true,
      default: "",
    },
    shippingCustomerPhone: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    totalAmountPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
      index: true,
    },
    subOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
  },
  {
    timestamps: true,
  }
);

parentOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ParentOrder", parentOrderSchema);
