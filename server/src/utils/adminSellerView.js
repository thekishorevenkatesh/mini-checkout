/** Fields never exposed to admin API responses */
const ADMIN_SELLER_OMIT = "-otp -otpExpiry -otpPurpose -otpTargetId -kycDetailsEncrypted";

/**
 * Normalize a seller document for admin clients (full profile minus OTP secrets).
 */
function toAdminSellerView(seller) {
  if (!seller) return null;

  const doc = seller.toObject ? seller.toObject() : { ...seller };
  delete doc.otp;
  delete doc.otpExpiry;
  delete doc.otpPurpose;
  delete doc.otpTargetId;
  delete doc.kycDetailsEncrypted;

  return doc;
}

module.exports = {
  ADMIN_SELLER_OMIT,
  toAdminSellerView,
};
