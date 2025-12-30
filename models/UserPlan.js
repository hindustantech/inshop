// models/UserPlan.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const userPlanSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // couponsUsed: {
        //     type: Schema.Types.ObjectId,
        //     ref: "Coupon",
        //     // required: true,
        // },

        planId: {
            type: Schema.Types.ObjectId,
            ref: "Plan",
            required: true,
        },

        status: {
            type: String,
            enum: ["active", "expired", "used", "cancelled"],
            default: "active",
        },

        startedAt: {
            type: Date,
            default: Date.now,
        },

        expiresAt: {
            type: Date, // null = lifetime
        },

        couponsAllowed: {
            type: Number,
            default: 0,
        },

        couponsUsed: {
            type: Number,
            default: 0,
        },

        lastUsedAt: Date,

        metadata: Schema.Types.Mixed,
    },
    { timestamps: true }
);

userPlanSchema.index({ userId: 1, status: 1 });

export default mongoose.models.UserPlan ||
    mongoose.model("UserPlan", userPlanSchema);
