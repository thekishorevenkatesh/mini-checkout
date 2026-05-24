import type { Order } from "../types";
import { formatAddress, getAddressValidationError } from "./contactFields";
import type { CheckoutContactAddress } from "../components/forms/CheckoutAddressSection";

export function validateCheckoutContact(
  contact: CheckoutContactAddress,
  label: string
): string {
  if (!contact.fullName.trim()) return `Enter full name for ${label}.`;
  if (!contact.phone.number.trim()) return `Enter phone number for ${label}.`;
  const addressError = getAddressValidationError(contact.address);
  if (addressError) return `${label}: ${addressError}`;
  return "";
}

export function formatCheckoutContactAddress(contact: CheckoutContactAddress): string {
  return formatAddress(contact.address);
}

export function getOrderBillingAddress(order: Order): string {
  return (order.billingAddress || order.deliveryAddress || "").trim();
}

export function getOrderShippingAddress(order: Order): string {
  if (order.shippingSameAsBilling === false && order.shippingAddress) {
    return order.shippingAddress.trim();
  }
  if (order.shippingAddress) return order.shippingAddress.trim();
  return (order.deliveryAddress || order.billingAddress || "").trim();
}

export function isOrderShippingSameAsBilling(order: Order): boolean {
  if (order.shippingSameAsBilling === false) return false;
  if (order.shippingSameAsBilling === true) return true;
  const billing = getOrderBillingAddress(order);
  const shipping = getOrderShippingAddress(order);
  return Boolean(billing && shipping && billing === shipping);
}

export function getOrderShippingContact(order: Order): { name: string; phone: string } {
  if (isOrderShippingSameAsBilling(order)) {
    return { name: order.customerName, phone: order.customerPhone };
  }
  return {
    name: order.shippingCustomerName || order.customerName,
    phone: order.shippingCustomerPhone || order.customerPhone,
  };
}

export function formatOrderAddressBlock(
  address: string,
  name?: string,
  phone?: string
): string {
  const lines = [name, phone, address].map((line) => String(line || "").trim()).filter(Boolean);
  return lines.join("\n");
}

export function getOrderShippingSummary(order: Order): string {
  return getOrderShippingAddress(order) || getOrderBillingAddress(order);
}
