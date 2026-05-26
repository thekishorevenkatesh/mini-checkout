const express = require("express");
const crypto = require("crypto");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");

const router = express.Router();
const validStatuses = ["pending", "paid", "delivered", "cancelled"];

function mapToObject(value) {
  return value instanceof Map ? Object.fromEntries(value.entries()) : (value || {});
}

function buildLegacyVariantItems(product) {
  const priceMap = mapToObject(product.variantPrices);
  const mrpMap = mapToObject(product.variantMrps);
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
    if (!variantId || !Number.isFinite(price) || price < 0) return acc;

    acc.push({
      variantId,
      title,
      attributes,
      price,
      mrp: Number.isFinite(mrp) && mrp >= 0 ? mrp : 0,
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

const razorpay = require("../utils/razorpay");
const ParentOrder = require("../models/ParentOrder");

function formatAddressParts(parts) {
  if (!parts || typeof parts !== "object" || Array.isArray(parts)) return "";

  return [
    parts.line1,
    parts.line2,
    parts.landmark,
    parts.city,
    parts.state,
    parts.country,
    parts.pincode,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function resolveAddressString(address, addressParts) {
  const formattedParts = formatAddressParts(addressParts);
  const nextAddress = String(address || "").trim();

  if (!nextAddress) return formattedParts;

  const pincode = String(addressParts?.pincode || "").replace(/\D/g, "");
  if (pincode && !new RegExp(`\\b${pincode}\\b`).test(nextAddress)) {
    return formattedParts || nextAddress;
  }

  return nextAddress;
}

function normalizeOrderAddresses(body = {}) {
  const deliveryAddress = resolveAddressString(body.deliveryAddress, body.deliveryAddressParts);
  const billingAddress = resolveAddressString(body.billingAddress, body.billingAddressParts);
  const shippingAddress = resolveAddressString(body.shippingAddress, body.shippingAddressParts);
  const shippingCustomerName = String(body.shippingCustomerName || "").trim();
  const shippingCustomerPhone = String(body.shippingCustomerPhone || "").trim();
  const shippingSameAsBilling =
    body.shippingSameAsBilling === false || body.shippingSameAsBilling === "false"
      ? false
      : true;

  if (!billingAddress && !shippingAddress && deliveryAddress) {
    return {
      billingAddress: deliveryAddress,
      shippingAddress: deliveryAddress,
      deliveryAddress,
      shippingSameAsBilling: true,
      shippingCustomerName: "",
      shippingCustomerPhone: "",
    };
  }

  const resolvedBilling = billingAddress || deliveryAddress || "";
  const resolvedShipping = shippingSameAsBilling
    ? resolvedBilling
    : shippingAddress || resolvedBilling;

  return {
    billingAddress: resolvedBilling,
    shippingAddress: resolvedShipping,
    deliveryAddress: resolvedShipping || resolvedBilling,
    shippingSameAsBilling,
    shippingCustomerName: shippingSameAsBilling ? "" : shippingCustomerName,
    shippingCustomerPhone: shippingSameAsBilling ? "" : shippingCustomerPhone,
  };
}

router.post("/", async (req, res) => {
  try {
    const {
      items,
      customerName,
      customerPhone,
      note,
      deliveryCharges = {}, // sellerId -> charge number
    } = req.body;

    const addressFields = normalizeOrderAddresses(req.body);

    if (!customerName || !customerPhone) {
      return res.status(400).json({
        message: "Customer name and customer phone are required",
      });
    }

    const requestedItems = Array.isArray(items) ? items : [];
    if (requestedItems.length === 0) {
      return res.status(400).json({ message: "At least one cart item is required" });
    }

    const normalizedOrderItems = [];
    const sellerIdsSet = new Set();
    const productDocs = new Map();

    // 1. Normalize items and verify products
    for (const requestedItem of requestedItems) {
      const requestedProductId = String(requestedItem?.productId || "").trim();
      if (!requestedProductId) {
        return res.status(400).json({ message: "Each cart item requires a productId" });
      }

      const parsedQuantity = Number(requestedItem?.quantity);
      const safeQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

      let product = productDocs.get(requestedProductId);
      if (!product) {
        product = await Product.findById(requestedProductId).populate("seller");
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

      if (matchedVariant && !matchedVariant.isActive) {
        return res.status(400).json({
          message: `${matchedVariant.title || product.title} is unavailable`,
        });
      }

      const lineVariantId = matchedVariant?.variantId || "";
      const unitPrice = matchedVariant ? matchedVariant.price : Number(product.price) || 0;
      const lineTotal = unitPrice * safeQuantity;

      sellerIdsSet.add(product.seller._id.toString());

      normalizedOrderItems.push({
        sellerId: product.seller._id,
        sellerDoc: product.seller,
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

    // 2. Create ParentOrder shell to derive ID
    const parentOrder = new ParentOrder({
      razorpayOrderId: "pending_creation_" + Math.random().toString(36).substring(2, 10),
      razorpayPaymentId: "",
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).trim(),
      deliveryAddress: addressFields.deliveryAddress,
      billingAddress: addressFields.billingAddress,
      shippingAddress: addressFields.shippingAddress,
      shippingSameAsBilling: addressFields.shippingSameAsBilling,
      shippingCustomerName: addressFields.shippingCustomerName,
      shippingCustomerPhone: addressFields.shippingCustomerPhone,
      note: note ? String(note).trim() : "",
      totalAmountPaise: 0,
      paymentStatus: "pending",
      subOrders: [],
    });
    await parentOrder.save();

    let grandTotalPaise = 0;
    const createdSubOrders = [];

    // 3. Group by Seller & calculate server-side splits in integer paise
    const itemsBySeller = new Map();
    for (const item of normalizedOrderItems) {
      const sellerIdStr = item.sellerId.toString();
      if (!itemsBySeller.has(sellerIdStr)) {
        itemsBySeller.set(sellerIdStr, {
          sellerDoc: item.sellerDoc,
          lines: [],
        });
      }
      itemsBySeller.get(sellerIdStr).lines.push(item);
    }

    for (const [sellerIdStr, data] of itemsBySeller.entries()) {
      const seller = data.sellerDoc;
      const lines = data.lines;

      // Extract delivery charge for this seller (with safe fallback)
      const inputDeliveryCharge = Number(deliveryCharges[sellerIdStr]) || 0;
      const deliveryChargePaise = Math.round(inputDeliveryCharge * 100);

      let itemRevenuePaise = 0;
      for (const line of lines) {
        const lineTotalPaise = Math.round(line.unitPrice * 100) * line.quantity;
        itemRevenuePaise += lineTotalPaise;
      }

      // Direct settlement: vendor receives full sub-order total (items + delivery).
      // commissionAmountPaise retained on schema for historical orders only; always 0 for new orders.
      const commissionPaise = 0;

      const totalSubOrderPaise = itemRevenuePaise + deliveryChargePaise;
      grandTotalPaise += totalSubOrderPaise;

      // Create Sub-Order
      const subOrder = await Order.create({
        seller: seller._id,
        parentOrder: parentOrder._id,
        razorpayOrderId: "", // will update post Razorpay Order creation
        items: lines.map((line) => ({
          product: line.productId,
          productTitle: line.productTitle,
          productCategory: line.productCategory,
          productImageUrl: line.productImageUrl,
          variantId: line.variantId,
          variantTitle: line.variantTitle,
          selectedVariants: line.selectedVariants,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
        customerName: parentOrder.customerName,
        customerPhone: parentOrder.customerPhone,
        deliveryAddress: parentOrder.deliveryAddress,
        billingAddress: parentOrder.billingAddress,
        shippingAddress: parentOrder.shippingAddress,
        shippingSameAsBilling: parentOrder.shippingSameAsBilling,
        shippingCustomerName: parentOrder.shippingCustomerName,
        shippingCustomerPhone: parentOrder.shippingCustomerPhone,
        note: parentOrder.note,
        amount: itemRevenuePaise / 100, // keep decimal representation for existing UI compatibility
        quantity: lines.reduce((sum, l) => sum + l.quantity, 0),
        deliveryCharge: inputDeliveryCharge,
        selectedVariants: lines[0].selectedVariants,
        paymentMethod: "prepaid",
        paymentStatus: "pending",
        commissionAmountPaise: commissionPaise,
        transferStatus: "untransferred",
      });

      createdSubOrders.push(subOrder);
    }

    // 4. Create Razorpay unified Order
    const rpOrder = await razorpay.orders.create({
      amount: grandTotalPaise,
      currency: "INR",
      receipt: parentOrder._id.toString(),
    });

    // 5. Update ParentOrder and Sub-Orders with Razorpay reference IDs
    parentOrder.razorpayOrderId = rpOrder.id;
    parentOrder.totalAmountPaise = grandTotalPaise;
    parentOrder.subOrders = createdSubOrders.map((o) => o._id);
    await parentOrder.save();

    for (const subOrder of createdSubOrders) {
      subOrder.razorpayOrderId = rpOrder.id;
      await subOrder.save();
    }

    return res.status(201).json({
      parentOrderId: parentOrder._id,
      razorpayOrderId: rpOrder.id,
      amount: grandTotalPaise / 100,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_mock_id",
      subOrders: createdSubOrders,
    });

  } catch (error) {
    console.error("[Order Creation Error]:", error);
    return res.status(500).json({ message: "Unable to create marketplace order", error: error.message });
  }
});

// Verify payment after Razorpay checkout succeeds on the client.
// This runs synchronously so orders are marked "paid" immediately,
// rather than waiting for the asynchronous webhook.
router.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderIds,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification fields" });
    }

    // Signature verification (skip when running mock / env not fully configured)
    const isMockMode =
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET ||
      process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";

    if (!isMockMode) {
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ message: "Payment signature verification failed" });
      }
    }

    // Update ParentOrder
    const parentOrder = await ParentOrder.findOne({
      razorpayOrderId: razorpay_order_id,
    }).populate("subOrders");

    if (!parentOrder) {
      return res.status(404).json({ message: "Order not found for this payment" });
    }

    if (parentOrder.paymentStatus !== "paid") {
      parentOrder.paymentStatus = "paid";
      parentOrder.razorpayPaymentId = razorpay_payment_id;
      await parentOrder.save();
    }

    // Update all sub-orders
    const updatedOrders = [];
    for (const subOrder of parentOrder.subOrders) {
      if (subOrder.paymentStatus !== "paid" && subOrder.paymentStatus !== "delivered") {
        subOrder.paymentStatus = "paid";
        await subOrder.save();
      }
      updatedOrders.push({ _id: subOrder._id, paymentStatus: subOrder.paymentStatus });
    }

    return res.json({
      verified: true,
      message: "Payment verified and orders updated",
      orders: updatedOrders,
    });
  } catch (error) {
    console.error("[Payment Verification Error]:", error);
    return res.status(500).json({ message: "Payment verification failed", error: error.message });
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
