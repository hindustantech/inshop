import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ["credit", "debit"],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    description: {
        type: String,
        default: "",
    },
    orderId: {
        type: String,
        required: true,
    },
    transactionId: {
        type: String,
        unique: true, // prevents duplicate credit/debit
        sparse: true, // allows null initially
    },
    status: {
        type: String,
        enum: ["pending", "success", "failed"],
        default: "pending",
    },
    meta: {
        // optional: extra logs, e.g., Razorpay response or error details
        type: Object,
        default: {},
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    balance: {
        type: Number,
        default: 0,
    },
    transactions: [transactionSchema],
    lastUpdated: {
        type: Date,
        default: Date.now,
    },
});

walletSchema.pre("save", function (next) {
    this.lastUpdated = new Date();
    next();
});

export default mongoose.model("Wallet", walletSchema);
