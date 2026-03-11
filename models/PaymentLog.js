import mongoose from "mongoose";

const paymentLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
 
    orderId: {
        type: String,
        required: true,
        index: true,
    },  
    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        default: null,
        index: true,
    },
    bannerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Banner",
        default: null,
        index: true,
    },
    plnaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        default: null,
        index: true,
    },
    

    paymentId: {
        type: String,
        default: null,
    },
    action: {
        type: String,
        enum: ["create_order", "verify_payment", "failed", "rollback"],
        required: true,
    },
    status: {
        type: String,
        enum: ["pending", "success", "failed"],
        default: "pending",
    },
    details: {
        type: Object,
        default: {},
    },
    message: {
        type: String,
        default: "",
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.model("PaymentLog", paymentLogSchema);
