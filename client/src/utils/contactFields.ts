export type AddressParts = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
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
  landmark: "",
};

export const DEFAULT_COUNTRY_CODE = "+91";

export function parseAddress(value: string): AddressParts {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    line1: parts[0] || "",
    line2: parts[1] || "",
    city: parts[2] || "",
    state: parts[3] || "",
    country: parts[4] || "",
    landmark: parts[5] || "",
  };
}

export function formatAddress(parts: AddressParts): string {
  return [
    parts.line1,
    parts.line2,
    parts.city,
    parts.state,
    parts.country,
    parts.landmark,
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
