require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Seller = require("../models/Seller");
const {
  applyKycStateFromPan,
  getPanCompliance,
  isValidPan,
  maskPan,
  panHash,
  recordComplianceEvent,
} = require("../utils/kycCompliance");

async function migrate() {
  await connectDB();
  const sellers = await Seller.find({});
  let updated = 0;
  let missingPan = 0;
  let invalidPan = 0;

  for (const seller of sellers) {
    const pan = getPanCompliance(seller).pan;

    if (!pan || !isValidPan(pan)) {
      if (!pan) missingPan += 1;
      else invalidPan += 1;
      seller.kycStatus = "incomplete";
      seller.panVerificationStatus = pan ? "rejected" : "unsubmitted";
      seller.payoutStatus = "blocked";
      if (seller.razorpayAccountStatus === "active") {
        seller.razorpayAccountStatus = "suspended";
      }
      seller.storePublished = false;
      if (seller.approvalStatus === "approved") {
        seller.approvalStatus = "suspended";
      }
      seller.onboardingProgress = "kyc_pending";
      recordComplianceEvent(seller, "migration_blocked_missing_or_invalid_pan", "system", {
        hadPan: Boolean(pan),
      });
      await seller.save();
      updated += 1;
      continue;
    }

    seller.pan = maskPan(pan);
    seller.panHash = seller.panHash || panHash(pan);
    applyKycStateFromPan(seller);
    recordComplianceEvent(seller, "migration_pan_metadata_backfilled", "system");
    await seller.save();
    updated += 1;
  }

  console.log(JSON.stringify({ scanned: sellers.length, updated, missingPan, invalidPan }, null, 2));
  await mongoose.connection.close();
}

migrate().catch(async (error) => {
  console.error(error);
  await mongoose.connection.close();
  process.exit(1);
});
