// models/Subscription.js

import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({

    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        unique: true
    },

    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan"
    },

    status: {
        type: String,
        enum: ["active", "pending", "expired", "cancelled", "grace"],
        default: "pending"
    },

    billingCycle: String,

    startDate: Date,
    endDate: Date,
    nextBillingDate: Date,

    razorpaySubscriptionId: String,
    razorpayCustomerId: String,

    lastPaymentId: String,

    graceUntil: Date

}, { timestamps: true });

export default mongoose.model("Subscription", subscriptionSchema);
