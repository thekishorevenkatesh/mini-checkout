const mongoose = require("mongoose");

const transactionLedgerSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      index: true,
      default: null, // null represents platform owner / admin commission earnings
    },
    amountPaise: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    purpose: {
      type: String,
      enum: [
        "order_item_revenue",
        "delivery_fee",
        "platform_commission",
        "refund",
        "reversal",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "settled", "failed", "reversed"],
      default: "pending",
      index: true,
    },
    razorpayTransferId: {
      type: String,
      trim: true,
      default: "",
    },
    reconciliationRef: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

transactionLedgerSchema.index({ sellerId: 1, type: 1, purpose: 1 });
transactionLedgerSchema.index({ createdAt: -1 });

module.exports = mongoose.model("TransactionLedger", transactionLedgerSchema);
