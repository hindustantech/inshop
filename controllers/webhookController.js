// controllers/webhookController.js
import { storeAndProcessWebhook } from "../services/paymentService.js";

export async function razorpayWebhookHandler(req, res, next) {
    try {
        const signature =
            req.headers["x-razorpay-signature"] ||
            req.headers["x-razorpay-signature".toLowerCase()];

        await storeAndProcessWebhook({
            rawBody: req.rawBody,
            body: req.body,
            signature,
        });

        return res.status(200).json({ status: "ok" });
    } catch (err) {
        // Webhook endpoints usually just log and return 200/400
        console.error("Webhook error:", err.message);
        return res.status(400).json({ status: "error" });
    }
}
