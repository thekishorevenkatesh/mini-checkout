const express = require("express");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");

const router = express.Router();
const validStatuses = ["pending", "paid", "confirmed", "cancelled"];

function resolveVariantQuantityMap(product) {
  return product.variantQuantities instanceof Map
    ? Object.fromEntries(product.variantQuantities.entries())
    : product.variantQuantities || {};
}

function mapToObject(value) {
  return value instanceof Map ? Object.fromEntries(value.entries()) : (value || {});
}

function buildLegacyVariantItems(product) {
  const priceMap = mapToObject(product.variantPrices);
  const mrpMap = mapToObject(product.variantMrps);
  const quantityMap = resolveVariantQuantityMap(product);
  const seen = new Set();
  const items = [];

  for (const variant of product.variants || []) {
    const label = String(variant?.label || "").trim();
    for (const optionValue of variant?.options || []) {
      const option = String(optionValue || "").trim();
      if (!label || !option) continue;

      const priceKey = `${label}::${option}`;
      const variantId = `legacy:${priceKey}`;
      if (seen.has(variantId)) continue;
      seen.add(variantId);

      items.push({
        variantId,
        title: option,
        attributes: { [label]: option },
        price: Number(priceMap[priceKey]) || Number(product.price) || 0,
        mrp: Number(mrpMap[priceKey]) || Number(product.mrp) || 0,
        stockQuantity: Number(quantityMap[priceKey]) || 0,
        isActive: true,
      });
    }
  }

  return items;
}

function getNormalizedVariantItems(product) {
  const explicitItems = Array.isArray(product.variantItems) ? product.variantItems : [];

  if (explicitItems.length > 0) {
    return explicitItems.map((item) => ({
      variantId: String(item.variantId || "").trim(),
      title: String(item.title || "").trim(),
      attributes: mapToObject(item.attributes),
      price: Number(item.price) || 0,
      mrp: Number(item.mrp) || 0,
      stockQuantity: Math.max(0, Number(item.stockQuantity) || 0),
      isActive: item.isActive !== false,
    }));
  }

  return buildLegacyVariantItems(product);
}

function normalizeVariantItems(input) {
  if (!Array.isArray(input)) return [];

  return input.reduce((acc, item, index) => {
    const variantId = String(item?.variantId || "").trim() || `variant-${index + 1}`;
    const title = String(item?.title || "").trim();
    const attributesInput =
      item?.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes)
        ? item.attributes
        : {};
    const attributes = Object.entries(attributesInput).reduce((next, [key, value]) => {
      const cleanKey = String(key || "").trim();
      const cleanValue = String(value || "").trim();
      if (cleanKey && cleanValue) {
        next[cleanKey] = cleanValue;
      }
      return next;
    }, {});
    const price = Number(item?.price);
    const mrp = Number(item?.mrp);
    const stockQuantity = Number(item?.stockQuantity);

    if (!variantId || !Number.isFinite(price) || price < 0) return acc;

    acc.push({
      variantId,
      title,
      attributes,
      price,
      mrp: Number.isFinite(mrp) && mrp >= 0 ? mrp : 0,
      stockQuantity:
        Number.isFinite(stockQuantity) && stockQuantity >= 0
          ? Math.floor(stockQuantity)
          : 0,
      isActive: item?.isActive !== false,
    });
    return acc;
  }, []);
}

function findVariantBySelection(product, selectedVariants = {}, variantId = "") {
  const normalizedItems = getNormalizedVariantItems(product);

  if (variantId) {
    return normalizedItems.find((item) => item.variantId === variantId) || null;
  }

  const targetEntries = Object.entries(selectedVariants || {}).filter(
    ([key, value]) => String(key || "").trim() && String(value || "").trim()
  );

  if (targetEntries.length === 0) return null;

  return (
    normalizedItems.find((item) =>
      targetEntries.every(
        ([key, value]) => String(item.attributes?.[key] || "") === String(value)
      )
    ) || null
  );
}

function buildOrderResponse(order) {
  const normalizedItems = Array.isArray(order.items) ? order.items : [];
  const firstItem = normalizedItems[0] || null;

  return {
    ...order.toObject(),
    product:
      order.product ||
      (firstItem
        ? {
            _id: firstItem.product?._id || firstItem.product,
            title: firstItem.productTitle,
            category: firstItem.productCategory,
            imageUrl: firstItem.productImageUrl,
          }
        : null),
    selectedVariants:
      order.selectedVariants ||
      (firstItem?.selectedVariants instanceof Map
        ? Object.fromEntries(firstItem.selectedVariants.entries())
        : firstItem?.selectedVariants || {}),
  };
}

router.post("/", async (req, res) => {
  try {
    const {
      items,
      productId,
      variantId = "",
      customerName,
      customerPhone,
      note,
      quantity = 1,
      deliveryAddress = "",
      deliveryCharge = 0,
      selectedVariants = {},
      paymentMethod = "prepaid",
      paymentScreenshotUrl = "",
    } = req.body;

    if (!customerName || !customerPhone) {
      return res.status(400).json({
        message: "Customer name and customer phone are required",
      });
    }

    const requestedItems = Array.isArray(items) && items.length > 0
      ? items
      : [{ productId, variantId, quantity, selectedVariants }];

    if (requestedItems.length === 0) {
      return res.status(400).json({ message: "At least one cart item is required" });
    }

    const groupedQuantities = new Map();
    const normalizedOrderItems = [];
    const productDocs = new Map();

    for (const requestedItem of requestedItems) {
      const requestedProductId = String(requestedItem?.productId || "").trim();
      if (!requestedProductId) {
        return res.status(400).json({ message: "Each cart item requires a productId" });
      }

      const parsedQuantity = Number(requestedItem?.quantity);
      const safeQuantity =
        Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

      let product = productDocs.get(requestedProductId);
      if (!product) {
        product = await Product.findById(requestedProductId).populate("seller", "_id");
        if (!product || !product.isActive) {
          return res.status(404).json({ message: "One or more products are unavailable" });
        }
        productDocs.set(requestedProductId, product);
      }

      const requestedVariantId = String(requestedItem?.variantId || "").trim();
      const requestedSelections =
        requestedItem?.selectedVariants &&
        typeof requestedItem.selectedVariants === "object" &&
        !Array.isArray(requestedItem.selectedVariants)
          ? requestedItem.selectedVariants
          : {};
      const matchedVariant = findVariantBySelection(
        product,
        requestedSelections,
        requestedVariantId
      );
      const normalizedVariantItems = getNormalizedVariantItems(product);

      if (normalizedVariantItems.length > 0 && !matchedVariant) {
        return res.status(400).json({
          message: `Select a valid variant for ${product.title}`,
        });
      }

      if (matchedVariant && (!matchedVariant.isActive || matchedVariant.stockQuantity <= 0)) {
        return res.status(400).json({
          message: `${matchedVariant.title || product.title} is out of stock`,
        });
      }

      const lineVariantId = matchedVariant?.variantId || "";
      const stockKey = `${requestedProductId}::${lineVariantId || "base"}`;
      const requestedSoFar = groupedQuantities.get(stockKey) || 0;
      const requestedTotal = requestedSoFar + safeQuantity;
      groupedQuantities.set(stockKey, requestedTotal);

      const unitPrice = matchedVariant ? matchedVariant.price : Number(product.price) || 0;
      const lineTotal = unitPrice * safeQuantity;

      normalizedOrderItems.push({
        sellerId: product.seller._id,
        productId: product._id,
        productTitle: product.title,
        productCategory: product.category || "",
        productImageUrl: product.imageUrl || "",
        variantId: lineVariantId,
        variantTitle: matchedVariant?.title || "",
        selectedVariants:
          matchedVariant?.attributes && Object.keys(matchedVariant.attributes).length > 0
            ? matchedVariant.attributes
            : requestedSelections,
        unitPrice,
        quantity: safeQuantity,
        lineTotal,
      });
    }

    const sellerIds = [...new Set(normalizedOrderItems.map((item) => String(item.sellerId)))];
    if (sellerIds.length !== 1) {
      return res.status(400).json({
        message: "All cart items in one order must belong to the same seller",
      });
    }

    for (const [compoundKey, requestedTotal] of groupedQuantities.entries()) {
      const [requestedProductId, requestedVariantId] = compoundKey.split("::");
      const product = productDocs.get(requestedProductId);
      const matchedVariant =
        getNormalizedVariantItems(product).find((item) => item.variantId === requestedVariantId) ||
        null;

      if (matchedVariant && requestedTotal > matchedVariant.stockQuantity) {
        return res.status(400).json({
          message: `${matchedVariant.title || product.title} has only ${matchedVariant.stockQuantity} left`,
        });
      }

      if (!matchedVariant) {
        const availableBaseStock = Number(product.stockQuantity);
        if (Number.isFinite(availableBaseStock) && availableBaseStock >= 0 && requestedTotal > availableBaseStock) {
          return res.status(400).json({
            message: `${product.title} has only ${availableBaseStock} left`,
          });
        }
      }
    }

    const totalQuantity = normalizedOrderItems.reduce((sum, item) => sum + item.quantity, 0);
    const amount = normalizedOrderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const safeDeliveryCharge = Number(deliveryCharge) >= 0 ? Number(deliveryCharge) : 0;
    const safePaymentMethod = paymentMethod === "cod" ? "cod" : "prepaid";
    const firstItem = normalizedOrderItems[0];

    const order = await Order.create({
      seller: firstItem.sellerId,
      product: firstItem.productId,
      items: normalizedOrderItems.map((item) => ({
        product: item.productId,
        productTitle: item.productTitle,
        productCategory: item.productCategory,
        productImageUrl: item.productImageUrl,
        variantId: item.variantId,
        variantTitle: item.variantTitle,
        selectedVariants: item.selectedVariants,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).trim(),
      deliveryAddress: String(deliveryAddress).trim(),
      note: note ? String(note).trim() : "",
      amount,
      quantity: totalQuantity,
      deliveryCharge: safeDeliveryCharge,
      selectedVariants: firstItem.selectedVariants,
      paymentMethod: safePaymentMethod,
      paymentStatus: safePaymentMethod === "cod" ? "confirmed" : "pending",
      paymentScreenshotUrl:
        safePaymentMethod === "prepaid" ? String(paymentScreenshotUrl || "").trim() : "",
    });

    for (const product of productDocs.values()) {
      const normalizedVariantItems = getNormalizedVariantItems(product);
      if (normalizedVariantItems.length === 0) continue;

      const nextVariantItems = normalizedVariantItems.map((item) => {
        const reservedQty = groupedQuantities.get(`${product._id}::${item.variantId}`) || 0;
        if (!reservedQty) return item;
        return {
          ...item,
          stockQuantity: Math.max(0, item.stockQuantity - reservedQty),
        };
      });

      product.variantItems = normalizeVariantItems(nextVariantItems);

      const nextQuantityMap = {};
      for (const item of nextVariantItems) {
        const attributeEntries = Object.entries(item.attributes || {});
        if (attributeEntries.length === 1) {
          const [label, value] = attributeEntries[0];
          nextQuantityMap[`${label}::${value}`] = item.stockQuantity;
        }
      }
      product.variantQuantities = nextQuantityMap;
      await product.save();
    }

    return res.status(201).json({ order });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to create order" });
  }
});

router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({ seller: req.sellerId })
      .populate("product", "title price imageUrl mrp category")
      .populate("items.product", "title price imageUrl mrp category")
      .sort({ createdAt: -1 });

    return res.json({ orders: orders.map(buildOrderResponse) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch orders" });
  }
});

router.get("/my/report", auth, async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await Order.find({
      seller: req.sellerId,
      createdAt: { $gte: since },
      paymentStatus: { $ne: "cancelled" },
    })
      .populate("product", "title price")
      .populate("items.product", "title price");

    const productMap = {};
    let totalRevenue = 0;

    for (const order of orders) {
      const orderItems = Array.isArray(order.items) && order.items.length > 0
        ? order.items
        : [{
            product: order.product,
            productTitle: order.product?.title || "",
            quantity: order.quantity,
            lineTotal: order.amount,
          }];

      for (const item of orderItems) {
        const key = item.product?._id?.toString() || item.product?.toString?.();
        if (!key) continue;
        if (!productMap[key]) {
          productMap[key] = {
            productId: key,
            title: item.productTitle || item.product?.title || "Untitled product",
            unitsSold: 0,
            revenue: 0,
          };
        }
        productMap[key].unitsSold += item.quantity || 0;
        productMap[key].revenue += item.lineTotal || 0;
      }

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

router.get("/my/export", auth, async (req, res) => {
  try {
    const orders = await Order.find({ seller: req.sellerId })
      .populate("product", "title price")
      .populate("items.product", "title price")
      .sort({ createdAt: -1 });

    const header =
      "Order ID,Date,Customer Name,Customer Phone,Items,Qty,Amount,Delivery Charge,Total,Status,Delivery Address,Note\n";

    const rows = orders
      .map((o) => {
        const total = o.amount + (o.deliveryCharge || 0);
        const date = new Date(o.createdAt).toLocaleDateString("en-IN");
        const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
        const orderItems = Array.isArray(o.items) && o.items.length > 0
          ? o.items
          : [{
              productTitle: o.product?.title || "",
              selectedVariants: o.selectedVariants || {},
              quantity: o.quantity,
            }];
        const itemSummary = orderItems
          .map((item) => {
            const variants =
              item.selectedVariants instanceof Map
                ? Object.values(Object.fromEntries(item.selectedVariants.entries()))
                : Object.values(item.selectedVariants || {});
            return `${item.productTitle}${variants.length ? ` (${variants.join("/")})` : ""} x${item.quantity}`;
          })
          .join(" | ");

        return [
          esc(o._id),
          esc(date),
          esc(o.customerName),
          esc(o.customerPhone),
          esc(itemSummary),
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

    return res.json({ order: buildOrderResponse(order) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update order status" });
  }
});

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

    return res.json({ order: buildOrderResponse(order) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update screenshot" });
  }
});

module.exports = router;
