const express = require("express");
const Product = require("../models/Product");
const Order = require("../models/Order");
const auth = require("../middleware/auth");

const router = express.Router();
const validStatuses = ["pending", "paid", "confirmed", "cancelled"];

// ─── POST /orders — Customer places order (no auth) ───────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      productId,
      customerName,
      customerPhone,
      note,
      quantity = 1,
      deliveryAddress = "",
      deliveryCharge = 0,
      selectedVariants = {},
    } = req.body;

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

    const itemTotal = Number(product.price) * safeQuantity;
    const safeDeliveryCharge = Number(deliveryCharge) >= 0 ? Number(deliveryCharge) : 0;

    const order = await Order.create({
      seller: product.seller._id,
      product: product._id,
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).trim(),
      deliveryAddress: String(deliveryAddress).trim(),
      note: note ? String(note).trim() : "",
      amount: itemTotal,
      quantity: safeQuantity,
      deliveryCharge: safeDeliveryCharge,
      selectedVariants,
      paymentStatus: "pending",
    });

    return res.status(201).json({ order });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to create order" });
  }
});

// ─── GET /orders/my — Seller's orders (auth) ─────────────────────────────
router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({ seller: req.sellerId })
      .populate("product", "title price imageUrl mrp category")
      .sort({ createdAt: -1 });

    return res.json({ orders });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch orders" });
  }
});

// ─── GET /orders/my/report — Top-selling + period stats (auth) ───────────
router.get("/my/report", auth, async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await Order.find({
      seller: req.sellerId,
      createdAt: { $gte: since },
      paymentStatus: { $ne: "cancelled" },
    }).populate("product", "title price");

    // Aggregate top-selling products
    const productMap = {};
    let totalRevenue = 0;

    for (const order of orders) {
      const key = order.product?._id?.toString();
      if (!key) continue;
      if (!productMap[key]) {
        productMap[key] = {
          productId: key,
          title: order.product.title,
          unitsSold: 0,
          revenue: 0,
        };
      }
      productMap[key].unitsSold += order.quantity;
      productMap[key].revenue += order.amount;
      totalRevenue += order.amount;
    }

    const topProducts = Object.values(productMap).sort(
      (a, b) => b.unitsSold - a.unitsSold
    );

    return res.json({
      period: days,
      totalOrders: orders.length,
      totalRevenue,
      topProducts,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to generate report" });
  }
});

// ─── GET /orders/my/export — CSV export (auth) ───────────────────────────
router.get("/my/export", auth, async (req, res) => {
  try {
    const orders = await Order.find({ seller: req.sellerId })
      .populate("product", "title price")
      .sort({ createdAt: -1 });

    const header =
      "Order ID,Date,Customer Name,Customer Phone,Product,Qty,Amount,Delivery Charge,Total,Status,Delivery Address,Note\n";

    const rows = orders
      .map((o) => {
        const total = o.amount + (o.deliveryCharge || 0);
        const date = new Date(o.createdAt).toLocaleDateString("en-IN");
        // Escape fields that may contain commas
        const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
        return [
          esc(o._id),
          esc(date),
          esc(o.customerName),
          esc(o.customerPhone),
          esc(o.product?.title || ""),
          esc(o.quantity),
          esc(o.amount),
          esc(o.deliveryCharge || 0),
          esc(total),
          esc(o.paymentStatus),
          esc(o.deliveryAddress),
          esc(o.note),
        ].join(",");
      })
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="orders-export.csv"'
    );
    return res.send(header + rows);
  } catch (error) {
    return res.status(500).json({ message: "Unable to export orders" });
  }
});

// ─── PATCH /orders/:orderId/status — Update order status (auth) ──────────
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

// ─── PATCH /orders/:orderId/payment-screenshot — Customer submits proof ──
router.patch("/:orderId/payment-screenshot", async (req, res) => {
  try {
    const { paymentScreenshotUrl } = req.body;

    if (!paymentScreenshotUrl) {
      return res.status(400).json({ message: "Screenshot URL is required" });
    }

    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.paymentScreenshotUrl = String(paymentScreenshotUrl).trim();
    await order.save();

    return res.json({ order });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update screenshot" });
  }
});

module.exports = router;
