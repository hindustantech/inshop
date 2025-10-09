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
        default :Date.now,
        required: true
    },
    serviceEndTime: {
        type: Date,
        
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
      
        min: 0
    },
    discountAmount: { 
        type: Number,
      
        min: 0
    },
    finalAmount: {
        type: Number,
      
        min: 0
    }
}, { timestamps: true });

const Sales = mongoose.model("Sales", salesSchema);
export default Sales;
