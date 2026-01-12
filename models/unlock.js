import mongoose from "mongoose";

const couponClickSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true
    },

    clickCount: {
        type: Number,
        default: 0,
        min: 0,
        max: 3
    },

    clickTimestamps: [{
        type: Date
    }],

    lastClickAt: {
        type: Date
    },

    isUnlocked: {
        type: Boolean,
        default: false,
        index: true
    },

    unlockAt: {
        type: Date
    },

    status: {
        type: String,
        enum: ["IN_PROGRESS", "UNLOCKED", "EXPIRED", "BLOCKED"],
        default: "IN_PROGRESS",
        index: true
    },

    expiresAt: {
        type: Date,
        index: true
    },

    abuseScore: {
        type: Number,
        default: 0
    },

    meta: {
        ipAddress: String,
        userAgent: String,
        deviceId: String
    }

}, { timestamps: true });

/* TTL cleanup */
couponClickSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CouponClick = mongoose.model("CouponClick", couponClickSchema);
