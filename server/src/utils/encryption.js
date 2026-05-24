const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

// Derives a robust key if the hex key isn't provided or is invalid
function getEncryptionKey() {
  const envKey = process.env.FINANCIAL_ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    try {
      return Buffer.from(envKey, "hex");
    } catch (e) {
      console.warn("Invalid FINANCIAL_ENCRYPTION_KEY format. Using fallback derivation.");
    }
  }
  // Safe developer fallback using a deterministic scrypt derivation
  return crypto.scryptSync(
    process.env.JWT_SECRET || "zensos_market_dev_encryption_secret_phrase",
    "zensos_financial_salt_123",
    32
  );
}

const KEY = getEncryptionKey();

/**
 * Encrypts cleartext into a colon-separated string: iv:authTag:cipherText
 * @param {string} text - Cleartext to encrypt
 * @returns {string} - Encrypted string format
 */
function encrypt(text) {
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted format: iv:authTag:cipherText back into cleartext
 * @param {string} cipherText - Encrypted format string
 * @returns {string} - Decrypted cleartext
 */
function decrypt(cipherText) {
  if (!cipherText) return "";
  try {
    const parts = cipherText.split(":");
    if (parts.length !== 3) {
      // Return cleartext directly for legacy unencrypted database support
      return cipherText;
    }
    
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encryptedText = Buffer.from(parts[2], "hex");
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error.message);
    return ""; // Return empty string on failure to protect logic stability
  }
}

module.exports = { encrypt, decrypt };
