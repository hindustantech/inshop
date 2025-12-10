// models/Plan.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const planSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        description: { type: String },
        type: {
            type: String,
            enum: ["one_time", "recurring", "promo", "enterprise"],
            default: "one_time",
        },
        price: { type: Number, required: true }, // amount user pays (paise)
        creditAmount: { type: Number, required: true }, // credited to wallet (paise)
        bonusPercentage: { type: Number, default: 0 },
        bonusAmount: { type: Number, default: 0 },
        currency: { type: String, default: "INR" },
        interval: { type: String, enum: ["day", "week", "month", "year"] },
        intervalCount: { type: Number, default: 1 },
        razorpayPlanId: { type: String, index: true },
        isActive: { type: Boolean, default: true },
        maxUsagePerUser: { type: Number, default: 0 },
        validFrom: Date,
        validTill: Date,
        eligibility: {
            type: String,
            enum: ["all", "new_user", "enterprise", "premium"],
            default: "all",
        },
        tier: { type: String, enum: ["basic", "gold", "platinum", "enterprise"], default: "basic" },
        tags: [String],
        metadata: Schema.Types.Mixed,
    },
    { timestamps: true }
);

planSchema.index({ isActive: 1, type: 1, validTill: 1 });
export default mongoose.models.Plan || mongoose.model("Plan", planSchema);
