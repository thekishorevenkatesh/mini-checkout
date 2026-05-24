const crypto = require("crypto");
const { decrypt } = require("./encryption");

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const VERIFIED_PAN_STATUS = "verified";
const VERIFIED_KYC_STATUS = "verified";

function normalizePan(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function isValidPan(value) {
  return PAN_REGEX.test(normalizePan(value));
}

function maskPan(value) {
  const pan = normalizePan(value);
  if (!pan) return "";
  if (pan.length !== 10) return "******" + pan.slice(-4);
  return `${pan.slice(0, 3)}****${pan.slice(-3)}`;
}

function panHash(value) {
  const pan = normalizePan(value);
  if (!pan) return "";
  return crypto.createHash("sha256").update(`pan:${pan}`).digest("hex");
}

function getDecryptedPan(seller) {
  return decrypt(seller?.kycDetailsEncrypted?.pan || "");
}

function getStoredPan(seller) {
  const decrypted = getDecryptedPan(seller);
  if (decrypted) return normalizePan(decrypted);
  return normalizePan(seller?.pan || "");
}

function getPanCompliance(seller) {
  const pan = getStoredPan(seller);
  return {
    pan,
    panMasked: maskPan(pan || seller?.pan),
    panHash: seller?.panHash || panHash(pan),
    panHolderName: String(seller?.panHolderName || "").trim(),
    panDocumentUrl: String(seller?.panDocumentUrl || "").trim(),
    panVerificationStatus: seller?.panVerificationStatus || "unsubmitted",
    isPanFormatValid: Boolean(pan && isValidPan(pan)),
  };
}

function collectKycIssues(seller, options = {}) {
  const {
    requireVerifiedPan = false,
    requireVerifiedKyc = false,
    requireBank = false,
    requireDocuments = false,
  } = options;
  const issues = [];
  const pan = getPanCompliance(seller);

  if (!pan.pan) issues.push("pan");
  else if (!pan.isPanFormatValid) issues.push("panFormat");
  if (!pan.panHolderName) issues.push("panHolderName");
  if (requireVerifiedPan && pan.panVerificationStatus !== VERIFIED_PAN_STATUS) {
    issues.push("panVerificationStatus");
  }
  if (requireVerifiedKyc && seller?.kycStatus !== VERIFIED_KYC_STATUS) {
    issues.push("kycStatus");
  }
  if (requireDocuments) {
    if (!String(seller?.idProofUrl || "").trim()) issues.push("idProofUrl");
    if (!String(seller?.addressProofUrl || "").trim()) issues.push("addressProofUrl");
  }

  if (requireBank) {
    if (!String(seller?.kycDetailsEncrypted?.bankAccountName || seller?.bankAccountName || "").trim()) {
      issues.push("bankAccountName");
    }
    if (!String(seller?.kycDetailsEncrypted?.bankAccountNumber || seller?.bankAccountNumber || "").trim()) {
      issues.push("bankAccountNumber");
    }
    if (!String(seller?.kycDetailsEncrypted?.bankIfsc || seller?.bankIfsc || "").trim()) {
      issues.push("bankIfsc");
    }
  }

  return issues;
}

function isPayoutEligible(seller) {
  return (
    seller?.payoutStatus === "enabled" &&
    seller?.razorpayAccountStatus === "active" &&
    collectKycIssues(seller, {
      requireVerifiedPan: true,
      requireVerifiedKyc: true,
      requireBank: true,
    }).length === 0
  );
}

function recordComplianceEvent(seller, action, actor = "system", metadata = {}) {
  if (!seller) return;
  if (!Array.isArray(seller.complianceAudit)) {
    seller.complianceAudit = [];
  }
  seller.complianceAudit.push({
    action,
    actor,
    metadata,
    at: new Date(),
  });
  if (seller.complianceAudit.length > 100) {
    seller.complianceAudit = seller.complianceAudit.slice(-100);
  }
}

function applyKycStateFromPan(seller) {
  const issues = collectKycIssues(seller, { requireDocuments: false });
  if (issues.length > 0) {
    seller.kycStatus = "incomplete";
    seller.panVerificationStatus = seller.panVerificationStatus || "unsubmitted";
    seller.payoutStatus = "blocked";
    return;
  }

  if (!seller.panVerificationStatus || seller.panVerificationStatus === "unsubmitted") {
    seller.panVerificationStatus = "pending";
  }
  if (!seller.kycStatus || seller.kycStatus === "incomplete") {
    seller.kycStatus = "pending";
  }
  if (!seller.payoutStatus || seller.payoutStatus === "blocked") {
    seller.payoutStatus = "blocked";
  }
}

module.exports = {
  PAN_REGEX,
  VERIFIED_KYC_STATUS,
  VERIFIED_PAN_STATUS,
  applyKycStateFromPan,
  collectKycIssues,
  getPanCompliance,
  isPayoutEligible,
  isValidPan,
  maskPan,
  normalizePan,
  panHash,
  recordComplianceEvent,
};
