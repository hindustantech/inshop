import mongoose from "mongoose";

const salesSchema = new mongoose.Schema({
    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    serviceStartTime: {
        type: Date,
        required: true
    },
    serviceEndTime: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["completed", "cancelled", "ongoing"],
        default: "ongoing"
    },
    usedCount: {
        type: Number,
        default: 1,
        min: 0
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    discountAmount: {
        type: Number,
        required: true,
        min: 0
    },
    finalAmount: {
        type: Number,
        required: true,
        min: 0
    }
}, { timestamps: true });

const Sales = mongoose.model("Sales", salesSchema);
export default Sales;
