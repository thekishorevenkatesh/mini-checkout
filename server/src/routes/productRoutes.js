const express = require("express");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");

const router = express.Router();

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
    } = req.body;

    if (!title || !price) {
      return res.status(400).json({ message: "Title and price are required" });
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
      price: Number(price),
      mrp: mrp ? Number(mrp) : 0,
      category: category ? String(category).trim() : "",
      variants: Array.isArray(variants) ? variants : [],
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

    return res.json({ seller, products });
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

    const { title, description, imageUrl, notes, price, mrp, category, variants } =
      req.body;

    if (title) product.title = String(title).trim();
    if (description !== undefined) product.description = String(description).trim();
    if (imageUrl !== undefined) product.imageUrl = String(imageUrl).trim();
    if (notes !== undefined) product.notes = String(notes).trim();
    if (price) product.price = Number(price);
    if (mrp !== undefined) product.mrp = Number(mrp);
    if (category !== undefined) product.category = String(category).trim();
    if (Array.isArray(variants)) product.variants = variants;

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
