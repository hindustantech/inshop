import mongoose from "mongoose";

const couponUnlockSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  unlockedAt: {
    type: Date,
    required: true
  },

  expiresAt: {
    type: Date,
    required: true,
    index: true
  },

  isUsed: {
    type: Boolean,
    default: false,
    index: true
  },

  usedAt: {
    type: Date
  },

  unlockMethod: {
    type: String,
    enum: ["THREE_SCAN", "ADMIN", "PROMOTION"],
    default: "THREE_SCAN"
  },

  status: {
    type: String,
    enum: ["ACTIVE", "EXPIRED", "USED"],
    default: "ACTIVE",
    index: true
  }

}, { timestamps: true });

/* Only one ACTIVE coupon per user */
couponUnlockSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } }
);

/* TTL cleanup */
couponUnlockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CouponUnlock = mongoose.model("CouponUnlock", couponUnlockSchema);
