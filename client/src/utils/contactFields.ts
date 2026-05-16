export type AddressParts = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  landmark: string;
};

export type PhoneParts = {
  countryCode: string;
  number: string;
};

export const EMPTY_ADDRESS: AddressParts = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  country: "",
  pincode: "",
  landmark: "",
};

export const DEFAULT_COUNTRY_CODE = "+91";

export function parseAddress(value: string): AddressParts {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const hasNewOrderPincodeAtEnd =
    parts.length >= 7 &&
    /^\d{4,10}$/.test(parts[parts.length - 1] || "") &&
    !/^\d{4,10}$/.test(parts[5] || "");

  if (hasNewOrderPincodeAtEnd) {
    return {
      line1: parts[0] || "",
      line2: parts[1] || "",
      landmark: parts[2] || "",
      city: parts[3] || "",
      state: parts[4] || "",
      country: parts[5] || "",
      pincode: parts[6] || "",
    };
  }

  return {
    line1: parts[0] || "",
    line2: parts[1] || "",
    city: parts[2] || "",
    state: parts[3] || "",
    country: parts[4] || "",
    pincode: parts[5] || "",
    landmark: parts[6] || "",
  };
}

export function formatAddress(parts: AddressParts): string {
  return [
    parts.line1,
    parts.line2,
    parts.landmark,
    parts.city,
    parts.state,
    parts.country,
    parts.pincode,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function parsePhone(value: string): PhoneParts {
  const raw = String(value || "").trim();
  if (!raw) {
    return { countryCode: DEFAULT_COUNTRY_CODE, number: "" };
  }

  if (raw.startsWith("+")) {
    const [code, ...rest] = raw.split(" ");
    const restNumber = rest.join(" ").replace(/\D/g, "");
    if (restNumber) {
      return { countryCode: code, number: restNumber };
    }
  }

  return {
    countryCode: DEFAULT_COUNTRY_CODE,
    number: raw.replace(/\D/g, ""),
  };
}

export function formatPhone(parts: PhoneParts): string {
  const cleanCode = parts.countryCode.trim() || DEFAULT_COUNTRY_CODE;
  const cleanNumber = parts.number.replace(/\D/g, "");
  return cleanNumber ? `${cleanCode} ${cleanNumber}` : "";
}
