import mongoose from "mongoose";
const { Schema } = mongoose;

const CouponShopUsageSchema = new Schema(
    {
        couponId: { type: Schema.Types.ObjectId, ref: "Coupon", required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        topUpAttemptId: { type: Schema.Types.ObjectId, ref: "TopUpAttempt" },
        planId: { type: Schema.Types.ObjectId, ref: "Plan" },

        // Transaction details
        amountBeforeDiscount: { type: Number, required: true }, // in paise
        discountApplied: { type: Number, default: 0 }, // in paise
        bonusCredit: { type: Number, default: 0 }, // in paise
        finalAmountPaid: { type: Number, required: true }, // in paise
        finalCreditReceived: { type: Number, required: true }, // in paise

        // Coupon details snapshot
        couponCode: { type: String, required: true },
        couponDiscountType: { type: String, enum: ["flat", "percentage", "bonus"], required: true },
        couponDiscountValue: { type: Number, required: true },

        currency: { type: String, default: "INR" },
        status: {
            type: String,
            enum: ["applied", "redeemed", "failed", "refunded", "expired"],
            default: "applied"
        },

        // For analytics
        userIp: String,
        userAgent: String,
        metadata: Schema.Types.Mixed,
    },
    { timestamps: true }
);

// Compound indexes for performance
CouponShopUsageSchema.index({ couponId: 1, userId: 1 });
CouponShopUsageSchema.index({ userId: 1, status: 1 });
CouponShopUsageSchema.index({ topUpAttemptId: 1 }, { sparse: true });
CouponShopUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 * 90 }); // Auto-delete after 90 days for failed

export default mongoose.models.CouponShopUsage || mongoose.model("CouponShopUsage", CouponShopUsageSchema);