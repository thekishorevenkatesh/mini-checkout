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
    from: `"MyDukan" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Your MyDukan OTP",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
          <span style="font-size:24px">🛍️</span>
          <span style="font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px">MyDukan</span>
        </div>
        <p style="color:#475569;margin:0 0 20px;font-size:15px">${greeting}</p>
        <p style="color:#475569;margin:0 0 12px;font-size:14px">Your one-time password (OTP) is:</p>
        <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#0d9488;margin:12px 0 24px;padding:16px;background:#f0fdfa;border-radius:12px;text-align:center">${otp}</div>
        <p style="color:#64748b;font-size:13px;margin:0 0 8px">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0" />
        <p style="color:#94a3b8;font-size:11px;margin:0">MyDukan — Your Store. Your Link. Your Sales.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
