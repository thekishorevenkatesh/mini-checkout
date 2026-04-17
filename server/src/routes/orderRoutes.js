const express = require("express");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");

const router = express.Router();
const validStatuses = ["pending", "paid", "confirmed", "cancelled"];

function resolveProductUnitPrice(product, selectedVariants = {}) {
  const priceMap = product.variantPrices instanceof Map
    ? Object.fromEntries(product.variantPrices.entries())
    : product.variantPrices || {};

  for (const variant of product.variants || []) {
    const option = selectedVariants?.[variant.label];
    if (!option) continue;
    const key = `${variant.label}::${option}`;
    const variantPrice = Number(priceMap[key]);
    if (Number.isFinite(variantPrice) && variantPrice > 0) {
      return variantPrice;
    }
  }

  return Number(product.price);
}

function resolveVariantQuantityMap(product) {
  return product.variantQuantities instanceof Map
    ? Object.fromEntries(product.variantQuantities.entries())
    : product.variantQuantities || {};
}

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
      paymentMethod = "prepaid",
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

    const quantityMap = resolveVariantQuantityMap(product);
    for (const variant of product.variants || []) {
      if (!Array.isArray(variant.options) || variant.options.length === 0) continue;

      const chosenOption = selectedVariants?.[variant.label];
      if (!chosenOption || !variant.options.includes(chosenOption)) {
        return res.status(400).json({
          message: `Please select a valid option for ${variant.label}`,
        });
      }

      const stockKey = `${variant.label}::${chosenOption}`;
      const availableStock = Number(quantityMap[stockKey]);
      if (Number.isFinite(availableStock) && availableStock >= 0 && safeQuantity > availableStock) {
        return res.status(400).json({
          message: `${chosenOption} (${variant.label}) has only ${availableStock} quantity left`,
        });
      }
    }

    const unitPrice = resolveProductUnitPrice(product, selectedVariants);
    const itemTotal = unitPrice * safeQuantity;
    const safeDeliveryCharge = Number(deliveryCharge) >= 0 ? Number(deliveryCharge) : 0;
    const safePaymentMethod = paymentMethod === "cod" ? "cod" : "prepaid";

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
      paymentMethod: safePaymentMethod,
      paymentStatus: safePaymentMethod === "cod" ? "confirmed" : "pending",
    });

    // Decrease variant stock after successful order creation.
    if ((product.variants || []).length > 0) {
      let didChangeStock = false;
      for (const variant of product.variants || []) {
        if (!Array.isArray(variant.options) || variant.options.length === 0) continue;
        const chosenOption = selectedVariants?.[variant.label];
        if (!chosenOption) continue;

        const stockKey = `${variant.label}::${chosenOption}`;
        const availableStock = Number(quantityMap[stockKey]);
        if (Number.isFinite(availableStock) && availableStock >= 0) {
          quantityMap[stockKey] = Math.max(0, availableStock - safeQuantity);
          didChangeStock = true;
        }
      }

      if (didChangeStock) {
        product.variantQuantities = quantityMap;
        await product.save();
      }
    }

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

// ─── GET /orders/public/status — Customer polling endpoint ────────────────
router.get("/public/status", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20);
    const sellerSlug = String(req.query.sellerSlug || "").trim();

    if (ids.length === 0) {
      return res.status(400).json({ message: "At least one order id is required" });
    }

    const query = { _id: { $in: ids } };

    if (sellerSlug) {
      const seller = await Seller.findOne({ slug: sellerSlug }).select("_id");

      if (!seller) {
        return res.status(404).json({ message: "Seller not found" });
      }

      query.seller = seller._id;
    }

    const orders = await Order.find(query)
      .select("_id paymentStatus updatedAt createdAt")
      .sort({ createdAt: -1 });

    return res.json({ orders });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch order statuses" });
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
