const crypto = require("crypto");

/**
 * Generate a 6-digit numeric OTP
 */
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Hash an OTP using SHA-256 (lightweight — OTPs are short-lived)
 */
function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/**
 * Verify a plain OTP against a stored hash
 */
function verifyOtp(plain, hash) {
  return hashOtp(plain) === hash;
}

module.exports = { generateOtp, hashOtp, verifyOtp };
