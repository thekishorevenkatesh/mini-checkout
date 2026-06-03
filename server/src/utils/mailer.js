const nodemailer = require("nodemailer");

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeSubjectLine(value = "", maxLength = 80) {
  return String(value).replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
}

function getOtpEmailContent({ purpose, intent = "", businessName = "", productTitle = "" }) {
  const safeBusiness = escapeHtml(businessName);
  const safeProduct = escapeHtml(productTitle);
  const isLogin = intent === "login";

  const templates = {
    auth: {
      subject: isLogin ? "Your Zensos login code" : "Verify your email for Zensos",
      headline: isLogin ? "Sign in to your seller dashboard" : "Verify your email address",
      reason: isLogin
        ? "You (or someone using your phone and email) requested a one-time code to <strong>sign in</strong> to your Zensos seller account."
        : "You requested a one-time code to <strong>verify your email</strong> and continue setting up your Zensos seller account.",
      action: isLogin
        ? "Enter the code below on the <strong>login</strong> screen to access your dashboard."
        : "Enter the code below on the <strong>registration</strong> screen to verify your email and continue.",
      warning: isLogin
        ? "If you did not try to sign in, you can ignore this email. Your account stays secure."
        : "If you did not start registration on Zensos, you can ignore this email.",
    },
    profile_delete: {
      subject: "Confirm permanent account deletion — Zensos",
      headline: "Confirm account deletion",
      reason:
        "You requested to <strong>permanently delete your Zensos seller profile</strong>, including your store settings and account access.",
      action:
        "Enter the code below on the profile page to confirm deletion. <strong>This cannot be undone.</strong>",
      warning:
        "If you did not request account deletion, do not share this code. Sign in and secure your account immediately.",
    },
    product_delete: {
      subject: safeProduct
        ? `Confirm product deletion: ${sanitizeSubjectLine(productTitle)}`
        : "Confirm product deletion — Zensos",
      headline: "Confirm product deletion",
      reason: safeProduct
        ? `You requested to <strong>permanently delete</strong> the product <strong>&ldquo;${safeProduct}&rdquo;</strong> from your store.`
        : "You requested to <strong>permanently delete a product</strong> from your Zensos store.",
      action: "Enter the code below on the products page to confirm and remove this product.",
      warning:
        "If you did not try to delete a product, ignore this email or contact support. Your catalog will not change.",
    },
    store_delete: {
      subject: "Confirm store data deletion — Zensos",
      headline: "Confirm store reset",
      reason:
        "You requested to <strong>delete all store data</strong> on Zensos (products and related store content). Your seller account will remain, but catalog data will be removed.",
      action: "Enter the code below in your dashboard to confirm this action.",
      warning:
        "If you did not request a store reset, do not use this code. Your store data will stay as it is.",
    },
  };

  return templates[purpose] || templates.auth;
}

function buildOtpEmailHtml({ otp, greeting, content }) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
      <div style="margin-bottom:24px;">
        <span style="font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">Zensos</span>
      </div>
      <p style="color:#475569;margin:0 0 16px;font-size:15px;line-height:1.5;">${greeting}</p>
      <h1 style="color:#0f172a;margin:0 0 12px;font-size:20px;font-weight:700;line-height:1.35;">${content.headline}</h1>
      <p style="color:#475569;margin:0 0 12px;font-size:14px;line-height:1.6;">${content.reason}</p>
      <p style="color:#475569;margin:0 0 20px;font-size:14px;line-height:1.6;">${content.action}</p>
      <p style="color:#64748b;margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Your verification code</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#0d9488;margin:0 0 20px;padding:16px 12px;background:#f0fdfa;border-radius:12px;text-align:center;font-family:ui-monospace,monospace;">${otp}</div>
      <p style="color:#64748b;font-size:13px;margin:0 0 16px;line-height:1.5;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone — Zensos will never ask for it by phone or chat.</p>
      <div style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;margin-bottom:20px;">
        <p style="color:#9a3412;font-size:13px;margin:0;line-height:1.5;"><strong>Didn&rsquo;t request this?</strong> ${content.warning}</p>
      </div>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0;" />
      <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.5;">Zensos — Your Store. Your Link. Your Sales.<br />This is an automated message; please do not reply.</p>
    </div>
  `;
}

function stripHtml(value = "") {
  return String(value).replace(/<[^>]+>/g, "");
}

function formatMoney(value = 0) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function getOrderItemRows(order) {
  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : [{
        productTitle: order.product?.title || "Ordered item",
        productCategory: order.product?.category || "",
        variantTitle: "",
        selectedVariants: order.selectedVariants || {},
        quantity: order.quantity,
        unitPrice: order.amount / Math.max(1, order.quantity || 1),
        lineTotal: order.amount,
      }];

  return items.map((item) => {
    const variants = item.selectedVariants instanceof Map
      ? Object.values(Object.fromEntries(item.selectedVariants.entries()))
      : Object.values(item.selectedVariants || {});
    const variantText = [item.variantTitle, ...variants]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" / ");

    return {
      title: item.productTitle || item.product?.title || "Ordered item",
      category: item.productCategory || item.product?.category || "",
      variantText,
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      lineTotal: item.lineTotal || 0,
    };
  });
}

function buildOrderConfirmationEmailHtml({ parentOrder, orders }) {
  const firstOrder = orders[0] || {};
  const seller = firstOrder.seller || {};
  const safeSellerName = escapeHtml(seller.businessName || "Seller");
  const sellerLogo = String(seller.businessLogo || "").trim();
  const orderDate = parentOrder.createdAt
    ? new Date(parentOrder.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const subtotal = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const deliveryTotal = orders.reduce((sum, order) => sum + Number(order.deliveryCharge || 0), 0);
  const total = subtotal + deliveryTotal;
  const paymentMethod = firstOrder.paymentMethod === "cod" ? "Cash on Delivery" : "Prepaid";

  const itemRows = orders.flatMap(getOrderItemRows).map((item) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;color:#111827;font-size:14px;font-weight:700;">${escapeHtml(item.title)}</p>
        ${item.category ? `<p style="margin:0 0 4px;color:#0f766e;font-size:12px;font-weight:600;">${escapeHtml(item.category)}</p>` : ""}
        ${item.variantText ? `<p style="margin:0;color:#6b7280;font-size:12px;">${escapeHtml(item.variantText)}</p>` : ""}
      </td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;text-align:center;">${item.quantity}</td>
      <td style="padding:12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;text-align:right;">${formatMoney(item.lineTotal)}</td>
    </tr>
  `).join("");

  const sellerDetails = [
    seller.businessEmail ? `Email: ${escapeHtml(seller.businessEmail)}` : "",
    seller.phone ? `Phone: ${escapeHtml(seller.phone)}` : "",
    seller.whatsappNumber ? `WhatsApp: ${escapeHtml(seller.whatsappNumber)}` : "",
    seller.callNumber ? `Call: ${escapeHtml(seller.callNumber)}` : "",
    seller.businessGST ? `GST: ${escapeHtml(seller.businessGST)}` : "",
    seller.businessAddress ? `Address: ${escapeHtml(seller.businessAddress)}` : "",
  ].filter(Boolean);

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:auto;padding:28px;border:1px solid #e5e7eb;border-radius:18px;background:#ffffff;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
        ${sellerLogo ? `<img src="${escapeHtml(sellerLogo)}" alt="${safeSellerName}" style="width:54px;height:54px;border-radius:12px;object-fit:contain;border:1px solid #e5e7eb;" />` : ""}
        <div>
          <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Order confirmation</p>
          <h1 style="margin:4px 0 0;color:#111827;font-size:22px;line-height:1.2;">${safeSellerName}</h1>
        </div>
      </div>

      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Hi ${escapeHtml(parentOrder.customerName || "there")}, your order has been confirmed. The seller has received your order details.</p>

      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:18px;background:#f9fafb;">
        <p style="margin:0 0 6px;color:#111827;font-size:14px;font-weight:700;">Order #${escapeHtml(String(parentOrder._id).slice(-8).toUpperCase())}</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">${escapeHtml(orderDate)} · ${escapeHtml(paymentMethod)}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 12px;text-align:left;color:#4b5563;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Item</th>
            <th style="padding:10px 12px;text-align:center;color:#4b5563;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>
            <th style="padding:10px 12px;text-align:right;color:#4b5563;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="margin-left:auto;max-width:260px;margin-bottom:20px;">
        <p style="display:flex;justify-content:space-between;margin:0 0 8px;color:#4b5563;font-size:13px;"><span>Items total</span><strong>${formatMoney(subtotal)}</strong></p>
        <p style="display:flex;justify-content:space-between;margin:0 0 8px;color:#4b5563;font-size:13px;"><span>Delivery</span><strong>${deliveryTotal ? formatMoney(deliveryTotal) : "Free"}</strong></p>
        <p style="display:flex;justify-content:space-between;margin:10px 0 0;padding-top:10px;border-top:1px solid #e5e7eb;color:#111827;font-size:15px;"><span>Total</span><strong>${formatMoney(total)}</strong></p>
      </div>

      <div style="display:grid;gap:12px;margin-bottom:18px;">
        <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px;">
          <p style="margin:0 0 8px;color:#111827;font-size:13px;font-weight:700;">Shipping details</p>
          <p style="margin:0;color:#4b5563;font-size:13px;line-height:1.6;">${escapeHtml(parentOrder.shippingCustomerName || parentOrder.customerName || "")}<br />${escapeHtml(parentOrder.shippingCustomerPhone || parentOrder.customerPhone || "")}<br />${escapeHtml(parentOrder.shippingAddress || parentOrder.deliveryAddress || "")}</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px;">
          <p style="margin:0 0 8px;color:#111827;font-size:13px;font-weight:700;">Seller details</p>
          <p style="margin:0;color:#4b5563;font-size:13px;line-height:1.6;">${sellerDetails.join("<br />") || safeSellerName}</p>
        </div>
      </div>

      <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.5;">Zensos - Your Store. Your Link. Your Sales.<br />This is an automated order confirmation.</p>
    </div>
  `;
}

function buildOrderConfirmationEmailText({ parentOrder, orders }) {
  const firstOrder = orders[0] || {};
  const seller = firstOrder.seller || {};
  const subtotal = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const deliveryTotal = orders.reduce((sum, order) => sum + Number(order.deliveryCharge || 0), 0);
  const total = subtotal + deliveryTotal;
  const paymentMethod = firstOrder.paymentMethod === "cod" ? "Cash on Delivery" : "Prepaid";
  const lines = orders.flatMap(getOrderItemRows).map((item) =>
    `- ${item.title}${item.variantText ? ` (${item.variantText})` : ""} x${item.quantity}: ${formatMoney(item.lineTotal)}`
  );

  return [
    `Hi ${parentOrder.customerName || "there"},`,
    "",
    `Your order with ${seller.businessName || "the seller"} has been confirmed.`,
    `Order ID: ${String(parentOrder._id).slice(-8).toUpperCase()}`,
    `Payment method: ${paymentMethod}`,
    "",
    "Items:",
    ...lines,
    "",
    `Items total: ${formatMoney(subtotal)}`,
    `Delivery: ${deliveryTotal ? formatMoney(deliveryTotal) : "Free"}`,
    `Total: ${formatMoney(total)}`,
    "",
    "Shipping:",
    parentOrder.shippingCustomerName || parentOrder.customerName || "",
    parentOrder.shippingCustomerPhone || parentOrder.customerPhone || "",
    parentOrder.shippingAddress || parentOrder.deliveryAddress || "",
    "",
    "Seller:",
    seller.businessName || "",
    seller.businessEmail ? `Email: ${seller.businessEmail}` : "",
    seller.phone ? `Phone: ${seller.phone}` : "",
    seller.businessAddress ? `Address: ${seller.businessAddress}` : "",
    "",
    "Zensos",
  ].filter((line) => line !== "").join("\n");
}

function buildOtpEmailText({ otp, plainGreeting, content }) {
  return [
    plainGreeting,
    "",
    content.headline,
    "",
    stripHtml(content.reason),
    stripHtml(content.action),
    "",
    `Your verification code: ${otp}`,
    "",
    "This code expires in 10 minutes. Do not share it with anyone.",
    "",
    `Didn't request this? ${stripHtml(content.warning)}`,
    "",
    "— Zensos",
  ].join("\n");
}

/**
 * Send a purpose-specific OTP email.
 * @param {string} toEmail
 * @param {string} otp
 * @param {object} [options]
 * @param {string} [options.businessName]
 * @param {string} [options.purpose] auth | profile_delete | product_delete | store_delete
 * @param {string} [options.intent] login | register (auth only)
 * @param {string} [options.productTitle]
 */
async function sendOtpEmail(toEmail, otp, options = {}) {
  const {
    businessName = "",
    purpose = "auth",
    intent = "",
    productTitle = "",
  } = typeof options === "string" ? { businessName: options } : options;

  const transporter = getTransporter();
  const plainGreeting = businessName ? `Hi ${businessName},` : "Hello,";
  const greeting = businessName ? `Hi ${escapeHtml(businessName)},` : "Hello,";
  const content = getOtpEmailContent({ purpose, intent, businessName, productTitle });

  await transporter.sendMail({
    from: `"Zensos" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: content.subject,
    text: buildOtpEmailText({ otp, plainGreeting, content }),
    html: buildOtpEmailHtml({ otp, greeting, content }),
  });
}

async function sendOrderConfirmationEmail(toEmail, { parentOrder, orders }) {
  const transporter = getTransporter();
  const sellerName = orders[0]?.seller?.businessName || "your order";

  await transporter.sendMail({
    from: `"Zensos" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `Order confirmed - ${sanitizeSubjectLine(sellerName)}`,
    text: buildOrderConfirmationEmailText({ parentOrder, orders }),
    html: buildOrderConfirmationEmailHtml({ parentOrder, orders }),
  });
}

module.exports = { sendOtpEmail, sendOrderConfirmationEmail };
