const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true }, // e.g. "Size", "Color"
    options: { type: [String], default: [] },            // e.g. ["S","M","L"]
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    mrp: {
      type: Number,
      default: 0,
      min: 0,
    },
    // "price" kept for backward compat — represents the selling price
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    variantPrices: {
      type: Map,
      of: Number,
      default: {},
    },
    variantMrps: {
      type: Map,
      of: Number,
      default: {},
    },
    variantQuantities: {
      type: Map,
      of: Number,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Product", productSchema);
