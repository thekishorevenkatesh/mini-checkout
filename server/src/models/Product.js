const mongoose = require("mongoose");
const PRODUCT_TITLE_MAX_LENGTH = 60;

const variantSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true }, // e.g. "Size", "Color"
    options: { type: [String], default: [] },            // e.g. ["S","M","L"]
  },
  { _id: false }
);

const variantItemSchema = new mongoose.Schema(
  {
    variantId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    attributes: {
      type: Map,
      of: String,
      default: {},
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    mrp: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
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
      maxlength: PRODUCT_TITLE_MAX_LENGTH,
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
    imageUrls: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    packSize: {
      type: String,
      trim: true,
      default: "",
    },
    uom: {
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
    variantItems: {
      type: [variantItemSchema],
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Optimize storefront and dashboard product listing queries
productSchema.index({ seller: 1, isActive: 1, createdAt: -1 });
productSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
