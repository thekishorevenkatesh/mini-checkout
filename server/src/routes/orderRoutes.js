const express = require("express");
const Product = require("../models/Product");
const Order = require("../models/Order");
const auth = require("../middleware/auth");

const router = express.Router();
const validStatuses = ["pending", "paid", "confirmed", "cancelled"];

router.post("/", async (req, res) => {
  try {
    const { productId, customerName, customerPhone, note, quantity = 1 } =
      req.body;

    if (!productId || !customerName || !customerPhone) {
      return res.status(400).json({
        message: "Product, customer name and customer phone are required",
      });
    }

    const parsedQuantity = Number(quantity);
    const safeQuantity =
      Number.isInteger(parsedQuantity) && parsedQuantity > 0
        ? parsedQuantity
        : 1;

    const product = await Product.findById(productId).populate("seller", "_id");

    if (!product || !product.isActive) {
      return res.status(404).json({ message: "Product is unavailable" });
    }

    const payableAmount = Number(product.price) * safeQuantity;

    const order = await Order.create({
      seller: product.seller._id,
      product: product._id,
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).trim(),
      note: note ? String(note).trim() : "",
      amount: Number(payableAmount),
      quantity: safeQuantity,
      paymentStatus: "pending",
    });

    return res.status(201).json({ order });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create order" });
  }
});

router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({ seller: req.sellerId })
      .populate("product", "title price imageUrl")
      .sort({ createdAt: -1 });

    return res.json({ orders });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch orders" });
  }
});

router.patch("/:orderId/status", auth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      seller: req.sellerId,
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.paymentStatus = status;
    await order.save();

    return res.json({ order });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update order status" });
  }
});

module.exports = router;
