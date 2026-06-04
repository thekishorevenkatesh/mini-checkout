const PlatformSetting = require("../models/PlatformSetting");

const COMMISSION_SETTING_KEY = "platform_commission_percentage";

function normalizeCommissionPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(100, Math.max(0, Math.round(numeric * 100) / 100));
}

function getEnvCommissionPercentage() {
  return normalizeCommissionPercentage(process.env.PLATFORM_COMMISSION_PERCENTAGE || 1);
}

async function getPlatformCommissionPercentage() {
  const setting = await PlatformSetting.findOne({ key: COMMISSION_SETTING_KEY });
  if (!setting) {
    return getEnvCommissionPercentage();
  }
  return normalizeCommissionPercentage(setting.value);
}

async function setPlatformCommissionPercentage(value, updatedBy = "admin") {
  const commissionPercentage = normalizeCommissionPercentage(value);
  const setting = await PlatformSetting.findOneAndUpdate(
    { key: COMMISSION_SETTING_KEY },
    {
      key: COMMISSION_SETTING_KEY,
      value: commissionPercentage,
      updatedBy,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return {
    setting,
    commissionPercentage,
  };
}

function calculatePlatformFeePaise(productAmountPaise, commissionPercentage) {
  const safeProductAmountPaise = Math.max(0, Math.round(Number(productAmountPaise) || 0));
  const safePercentage = normalizeCommissionPercentage(commissionPercentage);
  return Math.round((safeProductAmountPaise * safePercentage) / 100);
}

module.exports = {
  COMMISSION_SETTING_KEY,
  calculatePlatformFeePaise,
  getEnvCommissionPercentage,
  getPlatformCommissionPercentage,
  normalizeCommissionPercentage,
  setPlatformCommissionPercentage,
};
