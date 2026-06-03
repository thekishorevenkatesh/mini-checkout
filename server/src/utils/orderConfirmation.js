const ParentOrder = require("../models/ParentOrder");
const { sendOrderConfirmationEmail } = require("./mailer");

async function sendOrderConfirmationForParentOrder(parentOrderOrId) {
  const parentOrderId = parentOrderOrId?._id || parentOrderOrId;
  if (!parentOrderId) return;

  const parentOrder = await ParentOrder.findById(parentOrderId).populate({
    path: "subOrders",
    populate: [
      { path: "seller" },
      { path: "product", select: "title price imageUrl mrp category" },
      { path: "items.product", select: "title price imageUrl mrp category" },
    ],
  });

  if (!parentOrder || parentOrder.orderConfirmationEmailSentAt || !parentOrder.customerEmail) {
    return;
  }

  await sendOrderConfirmationEmail(parentOrder.customerEmail, {
    parentOrder,
    orders: parentOrder.subOrders || [],
  });

  parentOrder.orderConfirmationEmailSentAt = new Date();
  await parentOrder.save();
}

async function trySendOrderConfirmationForParentOrder(parentOrderOrId) {
  try {
    await sendOrderConfirmationForParentOrder(parentOrderOrId);
  } catch (error) {
    console.error("[Order Confirmation Email Error]:", error.message);
  }
}

module.exports = {
  sendOrderConfirmationForParentOrder,
  trySendOrderConfirmationForParentOrder,
};
