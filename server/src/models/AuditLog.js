const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ["admin", "seller", "system"],
      default: "system",
      index: true,
    },
    actorId: {
      type: String,
      trim: true,
      default: "",
    },
    targetType: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    targetId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
