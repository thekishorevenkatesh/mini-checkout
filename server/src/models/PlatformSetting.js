const mongoose = require("mongoose");

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    updatedBy: {
      type: String,
      trim: true,
      default: "system",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);
