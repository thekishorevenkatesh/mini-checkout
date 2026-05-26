import type { Order, OrderItem, OrderStatus, Seller } from "../types";
import {
  formatOrderAddressBlock,
  getOrderBillingAddress,
  getOrderShippingAddress,
  getOrderShippingContact,
  isOrderShippingSameAsBilling,
} from "./orderAddresses";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linesToHtml(block: string): string {
  return escapeHtml(block).replace(/\n/g, "<br>");
}

function getOrderItems(order: Order): OrderItem[] {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items;
  }

  if (!order.product) return [];

  return [
    {
      product: order.product,
      productTitle: order.product.title,
      productCategory: order.product.category,
      productImageUrl: order.product.imageUrl,
      variantId: "",
      variantTitle: "",
      selectedVariants: order.selectedVariants || {},
      unitPrice: order.quantity > 0 ? order.amount / order.quantity : order.amount,
      quantity: order.quantity,
      lineTotal: order.amount,
    },
  ];
}

function formatVariantLabel(item: OrderItem): string {
  if (item.variantTitle) return item.variantTitle;
  const values = Object.values(item.selectedVariants || {}).filter(Boolean);
  return values.join(" / ");
}

type PrintLabels = {
  status: Record<OrderStatus, string>;
};

export function buildOrderPrintHtml(order: Order, seller: Seller | null | undefined, labels: PrintLabels): string {
  const orderId = escapeHtml(order._id.slice(-8).toUpperCase());
  const orderDate = escapeHtml(
    new Date(order.createdAt).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const items = getOrderItems(order);
  const grandTotal = order.amount + (order.deliveryCharge || 0);
  const sameShipping = isOrderShippingSameAsBilling(order);
  const shippingContact = getOrderShippingContact(order);

  const billingHtml = linesToHtml(
    formatOrderAddressBlock(getOrderBillingAddress(order), order.customerName, order.customerPhone)
  );

  const shippingHtml = sameShipping
    ? '<p class="muted">Shipping address same as billing address</p>'
    : linesToHtml(
        formatOrderAddressBlock(
          getOrderShippingAddress(order),
          shippingContact.name,
          shippingContact.phone
        )
      );

  const sellerName = escapeHtml(seller?.businessName || "Store");
  const sellerCategory = seller?.businessCategory ? escapeHtml(seller.businessCategory) : "";
  const sellerEmail = seller?.businessEmail ? escapeHtml(seller.businessEmail) : "";
  const sellerPhone = escapeHtml(seller?.phone || seller?.callNumber || "");
  const sellerWhatsapp = seller?.whatsappNumber ? escapeHtml(seller.whatsappNumber) : "";
  const sellerGst = seller?.businessGST ? escapeHtml(seller.businessGST) : "";
  const sellerAddress = seller?.businessAddress ? linesToHtml(seller.businessAddress) : "";
  const sellerLogo = seller?.businessLogo ? escapeHtml(seller.businessLogo) : "";

  const productRows = items
    .map((item) => {
      const variant = formatVariantLabel(item);
      const category = item.productCategory ? escapeHtml(item.productCategory) : "";
      return `<tr>
        <td>
          <div class="product-title">${escapeHtml(item.productTitle)}</div>
          ${variant ? `<div class="product-meta">${escapeHtml(variant)}</div>` : ""}
          ${category ? `<div class="product-meta">${category}</div>` : ""}
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num">₹${item.unitPrice}</td>
        <td class="num"><strong>₹${item.lineTotal}</strong></td>
      </tr>`;
    })
    .join("");

  const noteBlock = order.note
    ? `<div class="note-box"><div class="section-label">Customer Note</div><p>${escapeHtml(order.note)}</p></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Order #${orderId}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 32px;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: #0f172a;
      background: #fff;
    }
    .doc-title {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 2px solid #0f766e;
    }
    .doc-title h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .doc-title .meta {
      text-align: right;
      font-size: 12px;
      color: #475569;
    }
    .doc-title .meta strong { color: #0f172a; }
    .status-pill {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #047857;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .header-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px 28px;
      margin-bottom: 20px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      background: #f8fafc;
    }
    .card.plain { background: #fff; }
    .section-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 8px;
    }
    .seller-name {
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 6px;
    }
    .seller-logo {
      max-height: 44px;
      max-width: 140px;
      object-fit: contain;
      margin-bottom: 8px;
      display: block;
    }
    .seller-line, .address-line {
      margin: 2px 0;
      color: #334155;
      font-size: 12px;
    }
    .shipping-row {
      margin-bottom: 22px;
    }
    .shipping-row .card {
      max-width: 100%;
    }
    .muted {
      margin: 0;
      color: #64748b;
      font-style: italic;
      font-size: 12px;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    table.data-table th {
      background: #0f766e;
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 10px 12px;
      text-align: left;
    }
    table.data-table th.num,
    table.data-table td.num {
      text-align: right;
      white-space: nowrap;
    }
    table.data-table td {
      border-bottom: 1px solid #e2e8f0;
      padding: 11px 12px;
      vertical-align: top;
    }
    table.data-table tbody tr:last-child td {
      border-bottom: none;
    }
    table.data-table tbody tr:nth-child(even) td {
      background: #f8fafc;
    }
    .product-title {
      font-weight: 600;
      color: #0f172a;
    }
    .product-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .summary-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
    table.summary-table {
      width: 280px;
      border-collapse: collapse;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }
    table.summary-table td {
      padding: 8px 14px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12px;
    }
    table.summary-table tr:last-child td {
      border-bottom: none;
    }
    table.summary-table td:last-child {
      text-align: right;
      font-weight: 600;
    }
    table.summary-table tr.grand td {
      background: #ecfdf5;
      font-size: 14px;
      font-weight: 700;
      color: #047857;
    }
    .details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 18px;
    }
    .detail-item {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .detail-item .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .detail-item .value {
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
    }
    .note-box {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid #fde68a;
      background: #fffbeb;
    }
    .note-box p {
      margin: 4px 0 0;
      color: #92400e;
      font-size: 12px;
    }
    @media print {
      body { padding: 16px 20px; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="doc-title">
    <div>
      <h1>Order Invoice</h1>
      <span class="status-pill">${escapeHtml(labels.status[order.paymentStatus])}</span>
    </div>
    <div class="meta">
      <div><strong>Order #</strong> ${orderId}</div>
      <div><strong>Date</strong> ${orderDate}</div>
    </div>
  </div>

  <div class="header-grid">
    <div class="card plain">
      <div class="section-label">Vendor / Seller</div>
      ${sellerLogo ? `<img class="seller-logo" src="${sellerLogo}" alt="${sellerName}" />` : ""}
      <p class="seller-name">${sellerName}</p>
      ${sellerCategory ? `<p class="seller-line">${sellerCategory}</p>` : ""}
      ${sellerEmail ? `<p class="seller-line">${sellerEmail}</p>` : ""}
      ${sellerPhone ? `<p class="seller-line">Phone: ${sellerPhone}</p>` : ""}
      ${sellerWhatsapp ? `<p class="seller-line">WhatsApp: ${sellerWhatsapp}</p>` : ""}
      ${sellerGst ? `<p class="seller-line">GST: ${sellerGst}</p>` : ""}
      ${sellerAddress ? `<p class="seller-line">${sellerAddress}</p>` : ""}
    </div>
    <div class="card">
      <div class="section-label">Billing Address</div>
      <div class="address-line">${billingHtml}</div>
    </div>
  </div>

  <div class="shipping-row">
    <div class="card plain">
      <div class="section-label">Shipping Address</div>
      <div class="address-line">${shippingHtml}</div>
    </div>
  </div>

  <div class="section-label" style="margin-bottom:6px;">Order Items</div>
  <table class="data-table">
    <thead>
      <tr>
        <th>Product</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${productRows || `<tr><td colspan="4">No items found</td></tr>`}
    </tbody>
  </table>

  <div class="summary-wrap">
    <table class="summary-table">
      <tr>
        <td>Items Subtotal</td>
        <td>₹${order.amount}</td>
      </tr>
      <tr>
        <td>Delivery Charge</td>
        <td>₹${order.deliveryCharge || 0}</td>
      </tr>
      <tr class="grand">
        <td>Grand Total</td>
        <td>₹${grandTotal}</td>
      </tr>
    </table>
  </div>

  <div class="details-grid">
    <div class="detail-item">
      <div class="label">Payment Method</div>
      <div class="value">${escapeHtml(order.paymentMethod || "—")}</div>
    </div>
    <div class="detail-item">
      <div class="label">Payment Status</div>
      <div class="value">${escapeHtml(labels.status[order.paymentStatus])}</div>
    </div>
  </div>

  ${noteBlock}

  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

export function openOrderPrintDocument(
  order: Order,
  seller: Seller | null | undefined,
  labels: PrintLabels
): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(buildOrderPrintHtml(order, seller, labels));
  printWindow.document.close();
}
