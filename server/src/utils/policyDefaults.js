const DEFAULT_PRIVACY_POLICY = `Privacy Policy

We collect only the customer information needed to process orders, deliver products, and provide support.

This may include name, phone number, address, order details, and payment-related reference information shared by the customer.

We do not sell or knowingly share customer personal information with unrelated third parties.

Customer information may be shared only with service providers or delivery partners when required to complete the order.

We take reasonable steps to protect the information shared with us, but no digital system can guarantee absolute security.

Customers can contact the seller directly for questions, corrections, or concerns related to their information.`;

const DEFAULT_RETURN_REFUND_POLICY = `Return & Refund Policy

Returns, replacements, and refunds are subject to the nature of the product and seller approval.

Customers should contact the seller as soon as possible if they receive a damaged, incorrect, or incomplete order.

Refunds, if approved, are generally processed only after the seller has verified the issue and accepted the request.

Customized, perishable, or time-sensitive products may not be eligible for return or refund unless otherwise stated by the seller.

Shipping or delivery charges may be non-refundable unless the issue was caused by the seller.

Customers should keep payment proof and order details available while requesting support.`;

const DEFAULT_TERMS_AND_CONDITIONS = `Terms and Conditions

By placing an order, the customer agrees to provide accurate contact, delivery, and payment information.

Orders are confirmed only after the seller reviews the order and payment status, where applicable.

Product images, descriptions, sizes, colors, and availability may vary slightly from the final delivered item.

The seller reserves the right to cancel, reject, or delay an order in case of pricing errors, stock issues, or unforeseen circumstances.

Customers are responsible for reviewing product details, pricing, delivery information, and seller policies before placing an order.

Any disputes regarding orders, delivery, returns, or refunds should be raised directly with the seller for resolution.`;

const DEFAULT_POLICY_CONTENT = {
  privacyPolicy: DEFAULT_PRIVACY_POLICY,
  returnRefundPolicy: DEFAULT_RETURN_REFUND_POLICY,
  termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
};

function getPolicyContent(seller = {}) {
  return {
    privacyPolicy: String(seller.privacyPolicy || DEFAULT_PRIVACY_POLICY).trim(),
    returnRefundPolicy: String(seller.returnRefundPolicy || DEFAULT_RETURN_REFUND_POLICY).trim(),
    termsAndConditions: String(seller.termsAndConditions || DEFAULT_TERMS_AND_CONDITIONS).trim(),
  };
}

module.exports = {
  DEFAULT_POLICY_CONTENT,
  getPolicyContent,
};
