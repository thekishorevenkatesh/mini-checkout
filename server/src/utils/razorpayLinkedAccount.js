const https = require("https");
const { decrypt } = require("./encryption");
const {
  collectKycIssues,
  getPanCompliance,
  isValidPan,
  recordComplianceEvent,
} = require("./kycCompliance");

const isMockMode =
  !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";

const LINKED_ACCOUNT_ONBOARDING = {
  NOT_STARTED: "not_started",
  KYC_INCOMPLETE: "kyc_incomplete",
  PENDING_APPROVAL: "pending_approval",
  LINKED_ACCOUNT_PENDING: "linked_account_pending",
  LINKED_ACCOUNT_CREATED: "linked_account_created",
  LINKED_ACCOUNT_FAILED: "linked_account_failed",
  PAYOUT_ENABLED: "payout_enabled",
};

const RAZORPAY_CATEGORY_MAP = {
  food: "food_and_beverage",
  grocery: "grocery",
  fashion: "fashion_and_lifestyle",
  electronics: "electronics",
  health: "healthcare",
  beauty: "personal_care",
  home: "home_and_furniture",
  services: "services",
  ecommerce: "ecommerce",
};

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function parseAddressParts(businessAddress) {
  const address = String(businessAddress || "").trim();
  const pinMatch = address.match(/\b(\d{6})\b/);
  const postalCode = pinMatch?.[1] || process.env.RAZORPAY_DEFAULT_POSTAL_CODE || "400001";

  return {
    street1: address.slice(0, 180) || "Business Address",
    street2: "",
    city: process.env.RAZORPAY_DEFAULT_CITY || "Mumbai",
    state: process.env.RAZORPAY_DEFAULT_STATE || "MH",
    postal_code: postalCode,
    country: "IN",
  };
}

function mapBusinessCategory(category) {
  const key = String(category || "ecommerce").trim().toLowerCase();
  return RAZORPAY_CATEGORY_MAP[key] || "ecommerce";
}

function mapRazorpayAccountStatus(accountStatus) {
  const normalized = String(accountStatus || "").toLowerCase();
  if (normalized === "activated" || normalized === "active") return "active";
  if (normalized === "suspended") return "suspended";
  if (normalized === "created" || normalized === "pending") return "pending";
  return "pending";
}

function syncLinkedAccountOnboardingStatus(seller) {
  if (!seller) return;

  if (seller.approvalStatus === "pending" || seller.approvalStatus === "draft") {
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.PENDING_APPROVAL;
    return;
  }

  if (collectLinkedAccountBlockers(seller).length > 0) {
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.KYC_INCOMPLETE;
    return;
  }

  if (seller.payoutStatus === "enabled" && seller.razorpayAccountStatus === "active") {
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.PAYOUT_ENABLED;
    return;
  }

  if (seller.linkedAccountOnboardingStatus === LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_FAILED) {
    return;
  }

  if (seller.razorpayAccountId) {
    seller.linkedAccountOnboardingStatus =
      seller.razorpayAccountStatus === "active"
        ? LINKED_ACCOUNT_ONBOARDING.PAYOUT_ENABLED
        : LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_CREATED;
    return;
  }

  if (seller.approvalStatus === "approved") {
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_PENDING;
    return;
  }

  seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.NOT_STARTED;
}

function collectLinkedAccountBlockers(seller) {
  const issues = collectKycIssues(seller, {
    requireVerifiedPan: true,
    requireVerifiedKyc: true,
    requireBank: true,
    requireDocuments: true,
  });

  if (!String(seller?.businessName || "").trim()) issues.push("businessName");
  if (!String(seller?.businessEmail || "").trim()) issues.push("businessEmail");
  if (!String(seller?.phone || "").trim()) issues.push("phone");
  if (!String(seller?.businessAddress || "").trim()) issues.push("businessAddress");

  const pan = getPanCompliance(seller);
  if (!pan.isPanFormatValid) issues.push("panFormat");

  return [...new Set(issues)];
}

function getSellerBankDetails(seller) {
  const bankAccountName = decrypt(
    seller.kycDetailsEncrypted?.bankAccountName || seller.bankAccountName || ""
  );
  const bankAccountNumber = decrypt(
    seller.kycDetailsEncrypted?.bankAccountNumber || seller.bankAccountNumber || ""
  );
  const bankIfsc = String(seller.kycDetailsEncrypted?.bankIfsc || seller.bankIfsc || "")
    .trim()
    .toUpperCase();
  const bankName = String(seller.kycDetailsEncrypted?.bankName || seller.bankName || "").trim();

  return {
    bankAccountName: bankAccountName || seller.panHolderName || seller.businessName,
    bankAccountNumber,
    bankIfsc,
    bankName,
  };
}

function buildLinkedAccountPayload(seller) {
  const pan = getPanCompliance(seller).pan;
  const businessType = seller.kycDetailsEncrypted?.businessType || "individual";
  const category = mapBusinessCategory(
    seller.kycDetailsEncrypted?.businessCategory || seller.businessCategory
  );
  const registeredAddress = parseAddressParts(seller.businessAddress);
  const referenceId = seller.razorpayReferenceId || `seller_${seller._id}`;

  const payload = {
    email: String(seller.businessEmail).trim().toLowerCase(),
    phone: normalizePhone(seller.phone),
    type: "route",
    reference_id: referenceId,
    legal_business_name: String(seller.businessName).trim(),
    customer_facing_business_name: String(seller.businessName).trim(),
    business_type: businessType,
    contact_name: String(seller.panHolderName || seller.businessName).trim(),
    profile: {
      category,
      subcategory: category,
      addresses: {
        registered: registeredAddress,
      },
    },
    legal_info: {
      pan,
    },
  };

  const gst = decrypt(seller.kycDetailsEncrypted?.gst || "");
  if (gst) {
    payload.legal_info.gst = gst;
  }

  return payload;
}

function buildStakeholderPayload(seller) {
  const registeredAddress = parseAddressParts(seller.businessAddress);
  return {
    name: String(seller.panHolderName || seller.businessName).trim(),
    email: String(seller.businessEmail).trim().toLowerCase(),
    percentage_ownership: 100,
    relationship: {
      director: true,
      executive: true,
    },
    phone: {
      primary: normalizePhone(seller.phone),
    },
    addresses: {
      residential: registeredAddress,
    },
  };
}

function razorpayApiRequest(method, path, body) {
  if (isMockMode) {
    return Promise.reject(new Error("MOCK_MODE"));
  }

  const payload = body ? JSON.stringify(body) : "";
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.razorpay.com",
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
            ).toString("base64"),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed = {};
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch (_error) {
            parsed = { raw: data };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
            return;
          }

          const message =
            parsed?.error?.description ||
            parsed?.error?.reason ||
            parsed?.message ||
            `Razorpay API ${res.statusCode}`;
          const error = new Error(message);
          error.statusCode = res.statusCode;
          error.razorpay = parsed;
          reject(error);
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function mockProvisionLinkedAccount(seller) {
  const accountId = seller.razorpayAccountId || `acc_${seller._id.toString().slice(-8)}`;
  const stakeholderId = seller.razorpayStakeholderId || `sth_${seller._id.toString().slice(-8)}`;
  const productId = seller.razorpayProductId || `pdt_${seller._id.toString().slice(-8)}`;

  return {
    accountId,
    stakeholderId,
    productId,
    accountStatus: "activated",
    activationStatus: "activated",
    mock: true,
  };
}

async function createLinkedAccount(seller) {
  const payload = buildLinkedAccountPayload(seller);
  return razorpayApiRequest("POST", "/v2/accounts", payload);
}

async function createStakeholder(accountId, seller) {
  const payload = buildStakeholderPayload(seller);
  return razorpayApiRequest("POST", `/v2/accounts/${accountId}/stakeholders`, payload);
}

async function requestRouteProduct(accountId) {
  return razorpayApiRequest("POST", `/v2/accounts/${accountId}/products`, {
    product_name: "route",
    tnc_accepted: true,
  });
}

async function updateRouteProductWithBank(accountId, productId, bankDetails) {
  return razorpayApiRequest("PATCH", `/v2/accounts/${accountId}/products/${productId}`, {
    settlements: {
      account_number: bankDetails.bankAccountNumber,
      ifsc_code: bankDetails.bankIfsc,
      beneficiary_name: bankDetails.bankAccountName,
    },
    tnc_accepted: true,
  });
}

async function fetchAccount(accountId) {
  return razorpayApiRequest("GET", `/v2/accounts/${accountId}`);
}

function applyProvisionResultToSeller(seller, result, actor = "system") {
  seller.razorpayAccountId = result.accountId;
  seller.razorpayStakeholderId = result.stakeholderId || seller.razorpayStakeholderId;
  seller.razorpayProductId = result.productId || seller.razorpayProductId;
  seller.razorpayReferenceId = seller.razorpayReferenceId || `seller_${seller._id}`;
  seller.razorpayLinkedAccountCreatedAt = seller.razorpayLinkedAccountCreatedAt || new Date();
  seller.razorpayAccountStatus = mapRazorpayAccountStatus(result.accountStatus);
  seller.razorpayOnboardingError = "";

  if (seller.razorpayAccountStatus === "active" || result.activationStatus === "activated") {
    seller.razorpayAccountStatus = "active";
    seller.payoutStatus = "enabled";
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.PAYOUT_ENABLED;
  } else {
    seller.payoutStatus = "blocked";
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_CREATED;
  }

  recordComplianceEvent(seller, "razorpay_linked_account_provisioned", actor, {
    razorpayAccountId: seller.razorpayAccountId,
    razorpayStakeholderId: seller.razorpayStakeholderId,
    razorpayProductId: seller.razorpayProductId,
    razorpayAccountStatus: seller.razorpayAccountStatus,
    linkedAccountOnboardingStatus: seller.linkedAccountOnboardingStatus,
    mock: Boolean(result.mock),
  });
}

function markProvisionFailure(seller, error, actor = "system") {
  seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_FAILED;
  seller.razorpayAccountStatus = seller.razorpayAccountId ? seller.razorpayAccountStatus : "uncreated";
  seller.payoutStatus = "blocked";
  seller.razorpayOnboardingError = String(error?.message || error).slice(0, 500);
  recordComplianceEvent(seller, "razorpay_linked_account_failed", actor, {
    reason: seller.razorpayOnboardingError,
    razorpayAccountId: seller.razorpayAccountId || "",
  });
}

async function provisionVendorLinkedAccount(seller, options = {}) {
  const actor = options.actor || "system";
  const force = Boolean(options.force);

  seller.razorpayReferenceId = seller.razorpayReferenceId || `seller_${seller._id}`;

  const blockers = collectLinkedAccountBlockers(seller);
  if (blockers.length > 0) {
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.KYC_INCOMPLETE;
    const error = new Error("Vendor KYC is incomplete for Razorpay linked account creation.");
    error.missingFields = blockers;
    error.statusCode = 400;
    throw error;
  }

  const pan = getPanCompliance(seller).pan;
  if (!isValidPan(pan)) {
    const error = new Error("Valid PAN is required before Razorpay linked account creation.");
    error.missingFields = ["panFormat"];
    error.statusCode = 400;
    throw error;
  }

  const bankDetails = getSellerBankDetails(seller);
  if (!bankDetails.bankAccountNumber || !bankDetails.bankIfsc || !bankDetails.bankAccountName) {
    const error = new Error("Complete bank details are required for Razorpay linked account creation.");
    error.missingFields = ["bankAccountName", "bankAccountNumber", "bankIfsc"].filter((field) => {
      if (field === "bankAccountName") return !bankDetails.bankAccountName;
      if (field === "bankAccountNumber") return !bankDetails.bankAccountNumber;
      return !bankDetails.bankIfsc;
    });
    error.statusCode = 400;
    throw error;
  }

  if (
    !force &&
    seller.razorpayAccountId &&
    seller.razorpayStakeholderId &&
    seller.razorpayProductId &&
    seller.linkedAccountOnboardingStatus !== LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_FAILED
  ) {
    syncLinkedAccountOnboardingStatus(seller);
    return {
      skipped: true,
      accountId: seller.razorpayAccountId,
      stakeholderId: seller.razorpayStakeholderId,
      productId: seller.razorpayProductId,
      accountStatus: seller.razorpayAccountStatus,
    };
  }

  seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_PENDING;
  seller.razorpayOnboardingError = "";

  try {
    if (isMockMode) {
      const mockResult = await mockProvisionLinkedAccount(seller);
      applyProvisionResultToSeller(seller, mockResult, actor);
      return { skipped: false, ...mockResult };
    }

    let accountId = seller.razorpayAccountId;
    let accountStatus = seller.razorpayAccountStatus;

    if (!accountId) {
      const account = await createLinkedAccount(seller);
      accountId = account.id;
      accountStatus = account.status;
      seller.razorpayAccountId = accountId;
    } else {
      const account = await fetchAccount(accountId);
      accountStatus = account.status;
    }

    let stakeholderId = seller.razorpayStakeholderId;
    if (!stakeholderId) {
      const stakeholder = await createStakeholder(accountId, seller);
      stakeholderId = stakeholder.id;
    }

    let productId = seller.razorpayProductId;
    let activationStatus = "requested";

    if (!productId) {
      const product = await requestRouteProduct(accountId);
      productId = product.id;
      activationStatus = product.activation_status || product.status || "requested";
    }

    const productUpdate = await updateRouteProductWithBank(accountId, productId, bankDetails);
    activationStatus = productUpdate.activation_status || activationStatus;

    const result = {
      accountId,
      stakeholderId,
      productId,
      accountStatus,
      activationStatus,
    };

    applyProvisionResultToSeller(seller, result, actor);
    return { skipped: false, ...result };
  } catch (error) {
    if (error.message === "MOCK_MODE") {
      const mockResult = await mockProvisionLinkedAccount(seller);
      applyProvisionResultToSeller(seller, mockResult, actor);
      return { skipped: false, ...mockResult };
    }

    markProvisionFailure(seller, error, actor);
    throw error;
  }
}

function applyAccountWebhookToSeller(seller, account) {
  if (!seller || !account) return;

  const mappedStatus = mapRazorpayAccountStatus(account.status);
  seller.razorpayAccountStatus = mappedStatus;

  if (mappedStatus === "active") {
    seller.payoutStatus = "enabled";
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.PAYOUT_ENABLED;
    seller.razorpayOnboardingError = "";
  } else if (mappedStatus === "suspended") {
    seller.payoutStatus = "suspended";
  } else if (seller.razorpayAccountId) {
    seller.payoutStatus = "blocked";
    seller.linkedAccountOnboardingStatus = LINKED_ACCOUNT_ONBOARDING.LINKED_ACCOUNT_CREATED;
  }

  recordComplianceEvent(seller, "razorpay_account_webhook_sync", "system", {
    razorpayAccountStatus: seller.razorpayAccountStatus,
    payoutStatus: seller.payoutStatus,
    linkedAccountOnboardingStatus: seller.linkedAccountOnboardingStatus,
  });
}

module.exports = {
  LINKED_ACCOUNT_ONBOARDING,
  applyAccountWebhookToSeller,
  collectLinkedAccountBlockers,
  provisionVendorLinkedAccount,
  syncLinkedAccountOnboardingStatus,
};
