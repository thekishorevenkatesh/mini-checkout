const express = require("express");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");
const { getPolicyContent } = require("../utils/policyDefaults");

const router = express.Router();

function withPolicyDefaults(sellerDoc) {
  if (!sellerDoc) return sellerDoc;

  const seller = sellerDoc.toObject ? sellerDoc.toObject() : sellerDoc;
  return {
    ...seller,
    ...getPolicyContent(seller),
  };
}

function normalizeVariantPrices(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    const numericValue = Number(value);
    if (key && Number.isFinite(numericValue) && numericValue > 0) {
      acc[key] = numericValue;
    }
    return acc;
  }, {});
}

function normalizeVariantMrps(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    const numericValue = Number(value);
    if (key && Number.isFinite(numericValue) && numericValue >= 0) {
      acc[key] = numericValue;
    }
    return acc;
  }, {});
}

function normalizeVariantQuantities(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    const numericValue = Number(value);
    if (key && Number.isFinite(numericValue) && numericValue >= 0) {
      acc[key] = Math.floor(numericValue);
    }
    return acc;
  }, {});
}

// ─── POST /products — Create product (auth) ───────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const {
      title,
      description,
      imageUrl,
      notes,
      price,
      mrp,
      category,
      variants,
      variantPrices,
      variantMrps,
      variantQuantities,
    } = req.body;

    const parsedVariants = Array.isArray(variants) ? variants : [];
    const normalizedVariantPrices = normalizeVariantPrices(variantPrices);
    const normalizedVariantMrps = normalizeVariantMrps(variantMrps);
    const hasVariantOptions = parsedVariants.some(
      (variant) => Array.isArray(variant?.options) && variant.options.length > 0
    );
    const hasBasePrice = Number.isFinite(Number(price)) && Number(price) > 0;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!hasBasePrice && !hasVariantOptions) {
      return res.status(400).json({
        message:
          "Provide a base selling price or add variant options with prices.",
      });
    }

    if (!hasBasePrice && Object.keys(normalizedVariantPrices).length === 0) {
      return res.status(400).json({
        message: "At least one variant selling price is required.",
      });
    }

    if (
      Number.isFinite(Number(mrp)) &&
      Number(mrp) > 0 &&
      hasBasePrice &&
      Number(price) >= Number(mrp)
    ) {
      return res.status(400).json({
        message: "Product selling price should be less than product MRP.",
      });
    }

    const invalidVariantMrp = Object.entries(normalizedVariantMrps).some(
      ([key, mrpValue]) =>
        Number.isFinite(Number(normalizedVariantPrices[key])) &&
        Number(normalizedVariantPrices[key]) >= Number(mrpValue)
    );
    if (invalidVariantMrp) {
      return res.status(400).json({
        message: "Each variant selling price should be less than its variant MRP.",
      });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const product = await Product.create({
      seller: seller._id,
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      imageUrl: imageUrl ? String(imageUrl).trim() : "",
      notes: notes ? String(notes).trim() : "",
      price: hasBasePrice ? Number(price) : 0,
      mrp: mrp ? Number(mrp) : 0,
      category: category ? String(category).trim() : "",
      variants: parsedVariants,
      variantPrices: normalizedVariantPrices,
      variantMrps: normalizedVariantMrps,
      variantQuantities: normalizeVariantQuantities(variantQuantities),
    });

    // Ensure category is tracked in seller's categories list
    if (category && !seller.categories.includes(String(category).trim())) {
      seller.categories.push(String(category).trim());
      await seller.save();
    }

    return res.status(201).json({ product });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to create product" });
  }
});

// ─── GET /products/my — Seller's own products (auth) ─────────────────────
router.get("/my", auth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.sellerId }).sort({
      createdAt: -1,
    });

    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch products" });
  }
});

// ─── GET /products/public/:sellerSlug — Public store (no auth) ───────────
router.get("/public/:sellerSlug", async (req, res) => {
  try {
    const seller = await Seller.findOne({ slug: req.params.sellerSlug }).select(
      "-otp -otpExpiry"
    );

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const products = await Product.find({
      seller: seller._id,
      isActive: true,
    }).sort({ createdAt: -1 });

    return res.json({ seller: withPolicyDefaults(seller), products });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch seller store" });
  }
});

// ─── PATCH /products/:productId/toggle — Toggle isActive (auth) ──────────
router.patch("/:productId/toggle", auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      seller: req.sellerId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.isActive = !product.isActive;
    await product.save();

    return res.json({ product });
  } catch (error) {
    return res.status(500).json({ message: "Unable to toggle product" });
  }
});

// ─── PUT /products/:productId — Update product (auth) ────────────────────
router.put("/:productId", auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      seller: req.sellerId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const {
      title,
      description,
      imageUrl,
      notes,
      price,
      mrp,
      category,
      variants,
      variantPrices,
      variantMrps,
      variantQuantities,
    } =
      req.body;

    const nextPrice = price !== undefined ? Number(price) || 0 : Number(product.price) || 0;
    const nextMrp = mrp !== undefined ? Number(mrp) || 0 : Number(product.mrp) || 0;
    const nextVariantPrices =
      variantPrices !== undefined
        ? normalizeVariantPrices(variantPrices)
        : (product.variantPrices instanceof Map
          ? Object.fromEntries(product.variantPrices.entries())
          : product.variantPrices || {});
    const nextVariantMrps =
      variantMrps !== undefined
        ? normalizeVariantMrps(variantMrps)
        : (product.variantMrps instanceof Map
          ? Object.fromEntries(product.variantMrps.entries())
          : product.variantMrps || {});

    if (nextMrp > 0 && nextPrice > 0 && nextPrice >= nextMrp) {
      return res.status(400).json({
        message: "Product selling price should be less than product MRP.",
      });
    }

    const invalidUpdatedVariantMrp = Object.entries(nextVariantMrps).some(
      ([key, mrpValue]) =>
        Number.isFinite(Number(nextVariantPrices[key])) &&
        Number(nextVariantPrices[key]) >= Number(mrpValue)
    );
    if (invalidUpdatedVariantMrp) {
      return res.status(400).json({
        message: "Each variant selling price should be less than its variant MRP.",
      });
    }

    if (title) product.title = String(title).trim();
    if (description !== undefined) product.description = String(description).trim();
    if (imageUrl !== undefined) product.imageUrl = String(imageUrl).trim();
    if (notes !== undefined) product.notes = String(notes).trim();
    if (price !== undefined) product.price = Number(price) || 0;
    if (mrp !== undefined) product.mrp = Number(mrp);
    if (category !== undefined) product.category = String(category).trim();
    if (Array.isArray(variants)) product.variants = variants;
    if (variantPrices !== undefined) product.variantPrices = normalizeVariantPrices(variantPrices);
    if (variantMrps !== undefined) product.variantMrps = normalizeVariantMrps(variantMrps);
    if (variantQuantities !== undefined) product.variantQuantities = normalizeVariantQuantities(variantQuantities);

    await product.save();

    // Keep seller categories in sync
    if (category) {
      const seller = await Seller.findById(req.sellerId);
      if (seller && !seller.categories.includes(String(category).trim())) {
        seller.categories.push(String(category).trim());
        await seller.save();
      }
    }

    return res.json({ product });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update product" });
  }
});

// ─── DELETE /products/:productId — Delete product (auth) ─────────────────
router.delete("/:productId", auth, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.productId,
      seller: req.sellerId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Unable to delete product" });
  }
});

module.exports = router;
