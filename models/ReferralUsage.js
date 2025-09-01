import mongoose from "mongoose";

const referralUsageSchema = new mongoose.Schema({
    referralCode: {
        type: String,
        required: true,
        index: true
    },
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    referredUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    dateUsed: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const ReferralUsage = mongoose.model("ReferralUsage", referralUsageSchema);
export default ReferralUsage;
