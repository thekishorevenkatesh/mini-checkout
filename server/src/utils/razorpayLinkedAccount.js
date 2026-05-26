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
  electronics: "electronics_and_furniture",
  health: "healthcare",
  beauty: "healthcare",
  home: "ecommerce",
  services: "services",
  ecommerce: "ecommerce",
};

const RAZORPAY_SUBCATEGORY_MAP = {
  food_and_beverage: "food_ordering",
  grocery: "grocery",
  fashion_and_lifestyle: "fashion_and_lifestyle",
  electronics_and_furniture: "electronics_and_furniture",
  healthcare: "clinic",
  ecommerce: "ecommerce_marketplace",
  services: "professional_services",
  personal_care: "health_and_beauty",
  home_and_furniture: "ecommerce_marketplace",
};

const INDIA_STATE_NAMES = {
  andamanandnicobarislands: "Andaman and Nicobar Islands",
  andhrapradesh: "Andhra Pradesh",
  arunachalpradesh: "Arunachal Pradesh",
  assam: "Assam",
  bihar: "Bihar",
  chandigarh: "Chandigarh",
  chhattisgarh: "Chhattisgarh",
  dadraandnagarhavelianddamananddiu: "Dadra and Nagar Haveli and Daman and Diu",
  delhi: "Delhi",
  goa: "Goa",
  gujarat: "Gujarat",
  haryana: "Haryana",
  himachalpradesh: "Himachal Pradesh",
  jammuandkashmir: "Jammu and Kashmir",
  jharkhand: "Jharkhand",
  karnataka: "Karnataka",
  kerala: "Kerala",
  ladakh: "Ladakh",
  lakshadweep: "Lakshadweep",
  madhyapradesh: "Madhya Pradesh",
  maharashtra: "Maharashtra",
  manipur: "Manipur",
  meghalaya: "Meghalaya",
  mizoram: "Mizoram",
  nagaland: "Nagaland",
  odisha: "Odisha",
  puducherry: "Puducherry",
  punjab: "Punjab",
  rajasthan: "Rajasthan",
  sikkim: "Sikkim",
  tamilnadu: "Tamil Nadu",
  telangana: "Telangana",
  tripura: "Tripura",
  uttarpradesh: "Uttar Pradesh",
  uttarakhand: "Uttarakhand",
  westbengal: "West Bengal",
};

const INDIA_STATE_CODES = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  CG: "Chhattisgarh",
  DD: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JK: "Jammu and Kashmir",
  JH: "Jharkhand",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  OR: "Odisha",
  OD: "Odisha",
  PY: "Puducherry",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TS: "Telangana",
  TG: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UT: "Uttarakhand",
  UK: "Uttarakhand",
  WB: "West Bengal",
};

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function normalizeAddressToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeIndiaStateName(value) {
  const state = String(value || "").trim();
  if (!state) return "";

  const codeMatch = INDIA_STATE_CODES[state.toUpperCase()];
  if (codeMatch) return codeMatch;

  return INDIA_STATE_NAMES[normalizeAddressToken(state)] || state;
}

function isKnownIndiaState(value) {
  const state = String(value || "").trim();
  if (!state) return false;
  return Boolean(INDIA_STATE_CODES[state.toUpperCase()] || INDIA_STATE_NAMES[normalizeAddressToken(state)]);
}

function isIndiaCountry(value) {
  return ["in", "ind", "india"].includes(normalizeAddressToken(value));
}

function normalizeCountryCode(value) {
  const country = String(value || "").trim();
  if (!country) return "";

  if (isIndiaCountry(country)) return "IN";

  return country.toUpperCase().slice(0, 2);
}

function detectCity(parts, stateIndex, countryIndex, postalIndex) {
  const candidates = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part, index }) => {
      if (!part || index === stateIndex || index === countryIndex || index === postalIndex) return false;
      if (/^\d{4,10}$/.test(part)) return false;
      if (isKnownIndiaState(part) || isIndiaCountry(part)) return false;
      return true;
    });

  return candidates[candidates.length - 1]?.part || "";
}

function parseAddressParts(businessAddress) {
  const address = String(businessAddress || "").trim();
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const pinMatch = address.match(/\b(\d{6})\b/);
  const postalCode = pinMatch?.[1] || "";
  const hasFormattedAddress =
    parts.length >= 7 &&
    /^\d{4,10}$/.test(parts[parts.length - 1] || "") &&
    isKnownIndiaState(parts[4]) &&
    Boolean(parts[5]);
  const stateIndex = parts.findIndex((part) => isKnownIndiaState(part));
  const countryIndex = parts.findIndex((part) => isIndiaCountry(part));
  const postalIndex = parts.findIndex((part) => /^\d{4,10}$/.test(part));

  if (hasFormattedAddress) {
    const [line1, line2 = "", landmark = "", city = "", state = "", country = ""] = parts;
    const street1 = [line1, line2, landmark].filter(Boolean).join(", ").slice(0, 180) || "Business Address";
    return {
      street1,
      street2: [line2, landmark].filter(Boolean).join(", ").slice(0, 180) || street1,
      city,
      state: normalizeIndiaStateName(state),
      postal_code: postalCode,
      country: normalizeCountryCode(country),
    };
  }

  if (stateIndex >= 0 || countryIndex >= 0) {
    const state = stateIndex >= 0 ? parts[stateIndex] : "";
    const country = countryIndex >= 0 ? parts[countryIndex] : "";
    const city = detectCity(parts, stateIndex, countryIndex, postalIndex);
    const streetParts = parts.filter((part, index) => (
      index !== stateIndex &&
      index !== countryIndex &&
      index !== postalIndex &&
      part !== city
    ));

    const street1 = streetParts.join(", ").slice(0, 180) || address.slice(0, 180) || "Business Address";
    return {
      street1,
      street2: street1,
      city,
      state: normalizeIndiaStateName(state),
      postal_code: postalCode,
      country: normalizeCountryCode(country),
    };
  }

  const street1 = address.slice(0, 180) || "Business Address";
  return {
    street1,
    street2: street1,
    city: "",
    state: "",
    postal_code: postalCode,
    country: "",
  };
}

function collectAddressIssues(businessAddress) {
  if (!String(businessAddress || "").trim()) {
    return ["businessAddress"];
  }

  const address = parseAddressParts(businessAddress);
  const issues = [];

  if (!String(address.street1 || "").trim()) issues.push("businessAddress");
  if (!String(address.city || "").trim()) issues.push("businessAddressCity");
  if (!String(address.state || "").trim()) issues.push("businessAddressState");
  if (!String(address.country || "").trim()) issues.push("businessAddressCountry");
  if (!String(address.postal_code || "").trim()) issues.push("businessAddressPincode");

  return issues;
}

function mapBusinessCategory(category) {
  const key = String(category || "ecommerce").trim().toLowerCase();
  const mappedCategory = RAZORPAY_CATEGORY_MAP[key] || "ecommerce";
  const mappedSubcategory = RAZORPAY_SUBCATEGORY_MAP[mappedCategory] || "ecommerce_marketplace";
  return { category: mappedCategory, subcategory: mappedSubcategory };
}

function mapRazorpayAccountStatus(accountStatus) {
  const normalized = String(accountStatus || "").toLowerCase();
  if (normalized === "activated" || normalized === "active") return "active";
  if (normalized === "suspended") return "suspended";
  if (normalized === "created" || normalized === "pending") return "pending";
  return "pending";
}

function isMissingRazorpayRouteError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.statusCode === 404 || message.includes("no route matched");
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
  issues.push(...collectAddressIssues(seller?.businessAddress));

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
  const businessType = seller.kycDetailsEncrypted?.businessType || "individual";
  const { category, subcategory } = mapBusinessCategory(
    seller.kycDetailsEncrypted?.businessCategory || seller.businessCategory
  );
  const registeredAddress = parseAddressParts(seller.businessAddress);

  const payload = {
    email: String(seller.businessEmail).trim().toLowerCase(),
    phone: normalizePhone(seller.phone),
    type: "route",
    legal_business_name: String(seller.businessName).trim(),
    customer_facing_business_name: String(seller.businessName).trim(),
    business_type: businessType,
    contact_name: String(seller.panHolderName || seller.businessName).trim(),
    profile: {
      category,
      subcategory,
      addresses: {
        registered: registeredAddress,
      },
    },
    legal_info: {},
  };

  // Seller-entered PAN is always a personal PAN. It belongs in the
  // stakeholder's kyc.pan field, NOT in legal_info.pan (which Razorpay
  // treats as the business entity / company PAN and rejects personal
  // PANs for individual, partnership, and other non-company types).

  if (process.env.RAZORPAY_USE_ACCOUNT_REFERENCE_ID === "true") {
    payload.reference_id = seller.razorpayReferenceId || `seller_${seller._id}`;
  }

  const gst = decrypt(seller.kycDetailsEncrypted?.gst || "");
  if (gst) {
    payload.legal_info.gst = gst;
  }

  return payload;
}

function buildStakeholderPayload(seller) {
  const pan = getPanCompliance(seller).pan;
  const parsedAddress = parseAddressParts(seller.businessAddress);

  // Stakeholder API expects a single `street` field, not street1/street2
  const residentialAddress = {
    street: [parsedAddress.street1, parsedAddress.street2]
      .filter(Boolean)
      .join(", ")
      .slice(0, 180) || "Business Address",
    city: parsedAddress.city,
    state: parsedAddress.state,
    postal_code: parsedAddress.postal_code,
    country: parsedAddress.country,
  };

  const payload = {
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
      residential: residentialAddress,
    },
  };

  // For individual sellers, attach PAN to stakeholder's KYC section
  // (Razorpay expects individual PAN here, not in the account's legal_info)
  if (pan) {
    payload.kyc = { pan };
  }

  return payload;
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
          error.method = method;
          error.path = path;
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
  const endpoint = error?.method && error?.path ? `${error.method} ${error.path}: ` : "";
  seller.razorpayOnboardingError = `${endpoint}${String(error?.message || error)}`.slice(0, 500);
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
      try {
        const account = await fetchAccount(accountId);
        accountStatus = account.status;
      } catch (error) {
        if (!isMissingRazorpayRouteError(error)) {
          throw error;
        }

        seller.razorpayAccountId = "";
        seller.razorpayStakeholderId = "";
        seller.razorpayProductId = "";
        seller.razorpayAccountStatus = "uncreated";
        accountId = "";

        const account = await createLinkedAccount(seller);
        accountId = account.id;
        accountStatus = account.status;
        seller.razorpayAccountId = accountId;
      }
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
