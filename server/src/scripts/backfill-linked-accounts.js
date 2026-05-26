/**
 * Backfill Razorpay linked accounts for approved vendors missing Route onboarding.
 *
 * Run from server/: node src/scripts/backfill-linked-accounts.js
 */

require("dotenv").config();
const connectDB = require("../config/db");
const Seller = require("../models/Seller");
const {
  collectLinkedAccountBlockers,
  provisionVendorLinkedAccount,
} = require("../utils/razorpayLinkedAccount");

async function main() {
  await connectDB();

  const candidates = await Seller.find({
    approvalStatus: "approved",
    $or: [
      { razorpayAccountId: "" },
      { razorpayAccountId: { $exists: false } },
      { linkedAccountOnboardingStatus: "linked_account_failed" },
      { razorpayStakeholderId: "" },
      { razorpayProductId: "" },
    ],
  });

  console.log(`Found ${candidates.length} approved sellers needing linked account backfill.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const seller of candidates) {
    const blockers = collectLinkedAccountBlockers(seller);
    if (blockers.length > 0) {
      skipped += 1;
      console.warn(`Skip ${seller.businessName} (${seller._id}): missing ${blockers.join(", ")}`);
      continue;
    }

    try {
      const result = await provisionVendorLinkedAccount(seller, {
        actor: "backfill-script",
        force: seller.linkedAccountOnboardingStatus === "linked_account_failed",
      });
      await seller.save();
      created += result.skipped ? 0 : 1;
      console.log(
        `${result.skipped ? "Already provisioned" : "Provisioned"}: ${seller.businessName} -> ${seller.razorpayAccountId}`
      );
    } catch (error) {
      failed += 1;
      await seller.save();
      console.error(`Failed ${seller.businessName}: ${error.message}`);
    }
  }

  console.log(`Done. provisioned=${created}, skipped=${skipped}, failed=${failed}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
