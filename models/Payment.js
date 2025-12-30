// models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        /* -------------------- OWNERSHIP -------------------- */
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        /* -------------------- PLAN INFO -------------------- */
        planId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Plan",
            required: true,
            index: true,
        },

        planSnapshot: {
            name: String,
            price: Number,
            durationDays: Number,
            maxCoupons: Number,
        },

        /* -------------------- COUPON LINK -------------------- */
        couponId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Coupon",
            default: null,
            index: true,
        },

        /* -------------------- PAYMENT CORE -------------------- */
        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        currency: {
            type: String,
            default: "INR",
        },

        status: {
            type: String,
            enum: [
                "initiated",
                "pending",
                "completed",
                "failed",
                "refunded",
                "coupon_created",
            ],
            default: "initiated",
            index: true,
        },

        paymentMethod: {
            type: String,
            enum: ["razorpay", "stripe", "upi", "card", "wallet"],
            required: true,
        },

        /* -------------------- GATEWAY DATA -------------------- */
        gateway: {
            provider: String, // razorpay / stripe
            orderId: String,
            paymentId: String,
            signature: String,
            rawResponse: mongoose.Schema.Types.Mixed,
        },

        /* -------------------- VALIDITY WINDOW -------------------- */
        validFrom: {
            type: Date,
            default: Date.now,
            index: true,
        },

        validTill: {
            type: Date,
            required: true,
            index: true,
        },

        /* -------------------- AUDIT -------------------- */
        metadata: {
            ip: String,
            device: String,
            userAgent: String,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/* -------------------- INDEXES -------------------- */

// Fast lookup for coupon creation eligibility
paymentSchema.index({
    userId: 1,
    status: 1,
    validTill: 1,
});

// Prevent reusing same payment for multiple coupons
paymentSchema.index(
    { _id: 1, couponId: 1 },
    { unique: true, partialFilterExpression: { couponId: { $exists: true } } }
);

export default mongoose.model("Payment", paymentSchema);
