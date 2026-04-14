const express = require("express");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");

const router = express.Router();

router.post("/", auth, async (req, res) => {
  try {
    const { title, description, imageUrl, notes, price } = req.body;

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
    });

    return res.status(201).json({ product });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create product" });
  }
});

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

router.get("/public/:sellerSlug", async (req, res) => {
  try {
    const seller = await Seller.findOne({ slug: req.params.sellerSlug }).select(
      "businessName upiId phone slug profileImageUrl"
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

module.exports = router;
