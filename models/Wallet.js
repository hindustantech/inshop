// models/Wallet.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const walletSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, unique: true },
        currency: { type: String, default: "INR" },
        balance: { type: Number, default: 0 }, // stored in paise
        reserved: { type: Number, default: 0 },
        status: { type: String, enum: ["active", "frozen", "closed"], default: "active" },
        version: { type: Number, default: 0 }, // OCC for concurrency
        lastTransactionAt: { type: Date },
        metadata: Schema.Types.Mixed,
    },
    { timestamps: true }
);

walletSchema.index({ userId: 1 });
walletSchema.set("versionKey", "version");
export default mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
