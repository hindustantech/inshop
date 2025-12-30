import mongoose from "mongoose";
const { Schema } = mongoose;

const topUpAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    
    // Plan details
    planId: { type: Schema.Types.ObjectId, ref: "Plan" },
    planSnapshot: { type: Object },
    
    // Coupon details
    couponId: { type: Schema.Types.ObjectId, ref: "Coupon" },
    couponId: { type: Schema.Types.ObjectId, ref: "Banner" },
    couponCode: { type: String },
    couponUsageId: { type: Schema.Types.ObjectId, ref: "CouponShopUsage" },
    
    // Payment amounts
    baseAmount: { type: Number, required: true }, // Plan price in paise
    discountAmount: { type: Number, default: 0 }, // Discount applied in paise
    bonusAmount: { type: Number, default: 0 }, // Bonus credit in paise
    finalAmount: { type: Number, required: true }, // Amount user pays in paise
    creditAmount: { type: Number, required: true }, // Total credit to wallet in paise
    
    // Payment provider
    provider: { type: String, default: "razorpay" },
    providerOrderId: { type: String, index: true },
    providerPaymentId: { type: String, index: true },
    
    // Status
    status: {
      type: String,
      enum: [
        "created", 
        "initiated", 
        "pending", 
        "completed", 
        "failed", 
        "cancelled", 
        "refunded",
        "coupon_applied",
        "awaiting_payment"
      ],
      default: "created",
    },
    
    currency: { type: String, default: "INR" },
    
    // Idempotency
    idempotencyKey: { type: String, index: true },
    
    // Raw data
    rawRequest: Schema.Types.Mixed,
    rawResponse: Schema.Types.Mixed,
    
    // Error handling
    error: Schema.Types.Mixed,
    errorCode: String,
    
    // Metadata
    metadata: Schema.Types.Mixed,
    userIp: String,
    userAgent: String,
  },
  { timestamps: true }
);

// Indexes
topUpAttemptSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
topUpAttemptSchema.index({ userId: 1, createdAt: -1 });
topUpAttemptSchema.index({ status: 1, createdAt: 1 });
topUpAttemptSchema.index({ couponId: 1 });

export default mongoose.models.TopUpAttempt || mongoose.model("TopUpAttempt", topUpAttemptSchema);