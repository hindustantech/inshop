// models/Transaction.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const transactionSchema = new Schema(
    {
        walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: {
            type: String,
            enum: ["topup", "payment", "refund", "payout", "fee", "adjustment", "hold", "release"],
            required: true,
        },
        direction: { type: String, enum: ["credit", "debit"], required: true },
        amount: { type: Number, required: true }, // paise
        balanceBefore: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        currency: { type: String, default: "INR" },
        status: { type: String, enum: ["pending", "success", "failed", "reversed"], default: "pending" },
        idempotencyKey: { type: String, index: true },
        external: {
            provider: String, // e.g., "razorpay"
            paymentId: String,
            orderId: String,
            captureId: String,
            raw: Schema.Types.Mixed,
        },
        referenceId: { type: String, index: true }, // internal linkage to TopUpAttempt or order
        note: String,
        metadata: Schema.Types.Mixed,
    },
    { timestamps: true }
);

transactionSchema.index({ walletId: 1, createdAt: -1 });
transactionSchema.index({ idempotencyKey: 1 }, { unique: false });
transactionSchema.index({ "external.paymentId": 1 });
export default mongoose.models.Transaction || mongoose.model("Transaction", transactionSchema);
