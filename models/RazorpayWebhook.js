// models/RazorpayWebhook.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const webhookSchema = new Schema(
    {
        provider: { type: String, default: "razorpay" },
        event: { type: String, required: true },
        payload: Schema.Types.Mixed,
        signature: String,
        processed: { type: Boolean, default: false },
        processedAt: Date,
        retries: { type: Number, default: 0 },
        error: Schema.Types.Mixed,
    },
    { timestamps: true }
);

webhookSchema.index({ event: 1, createdAt: -1 });
webhookSchema.index({ processed: 1 });
export default mongoose.models.RazorpayWebhook || mongoose.model("RazorpayWebhook", webhookSchema);
