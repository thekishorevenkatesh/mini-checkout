const nodemailer = require("nodemailer");

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Send an OTP email to the given address
 */
async function sendOtpEmail(toEmail, otp, businessName = "") {
  const transporter = getTransporter();
  const greeting = businessName ? `Hi ${businessName},` : "Hello,";

  await transporter.sendMail({
    from: `"Mini Checkout" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Your Mini Checkout OTP",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#0f172a;margin:0 0 8px">Mini Checkout</h2>
        <p style="color:#475569;margin:0 0 20px">${greeting}</p>
        <p style="color:#475569;margin:0 0 8px">Your one-time password (OTP) is:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a;margin:12px 0 20px">${otp}</div>
        <p style="color:#64748b;font-size:13px;margin:0">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
