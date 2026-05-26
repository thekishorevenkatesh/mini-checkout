/**
 * One-time migration helper for orders created under the old escrow model.
 *
 * Finds paid sub-orders with processed Route transfers that may still be on_hold
 * in Razorpay (released only when marked "delivered" in the old flow).
 *
 * Run from server/: node src/scripts/release-held-transfers.js
 *
 * Safe to re-run: Razorpay returns success if hold is already cleared.
 */

require("dotenv").config();
const https = require("https");
const connectDB = require("../config/db");
const Order = require("../models/Order");

const isMock =
  !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";

function releaseTransferHold(transferId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ on_hold: false });
    const req = https.request(
      `https://api.razorpay.com/v1/transfers/${transferId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
            ).toString("base64"),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data || "{}"));
          } else {
            reject(new Error(`Razorpay ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  await connectDB();

  const candidates = await Order.find({
    paymentStatus: { $in: ["paid", "delivered"] },
    transferStatus: "processed",
    transferId: { $ne: "" },
  }).select("_id transferId paymentStatus");

  console.log(`Found ${candidates.length} sub-orders with processed transfers.`);

  if (isMock) {
    console.log("Mock mode — no Razorpay API calls made.");
    process.exit(0);
  }

  let released = 0;
  let failed = 0;

  for (const order of candidates) {
    try {
      await releaseTransferHold(order.transferId);
      released += 1;
      console.log(`Released hold: order ${order._id} transfer ${order.transferId}`);
    } catch (err) {
      failed += 1;
      console.warn(`Skip/fail ${order._id}: ${err.message}`);
    }
  }

  console.log(`Done. Released: ${released}, failed/skipped: ${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
