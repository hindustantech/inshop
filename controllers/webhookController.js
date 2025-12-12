// controllers/webhookController.js
import { storeAndProcessWebhook } from "../services/paymentService.js";
import { verifyManualPaymentSignature, processSuccessfulPayment } from "../services/paymentService.js";

export async function razorpayWebhookHandler(req, res, next) {
    console.log("razorpayWebhookHandler Enter")
    try {
        const signature =
            req.headers["x-razorpay-signature"] ||
            req.headers["x-razorpay-signature".toLowerCase()];

        await storeAndProcessWebhook({
            rawBody: req.rawBody,
            body: req.body,
            signature,
        });
        console.log("Success");


        return res.status(200).json({ status: "ok" });
    } catch (err) {
        // Webhook endpoints usually just log and return 200/400
        console.error("Webhook error:", err.message);
        return res.status(400).json({ status: "error" });
    }
}

export async function verifyPaymentController(req, res) {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const isValid = verifyManualPaymentSignature({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        });

        if (!isValid) {
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        // Optionally process the wallet credit
        const result = await processSuccessfulPayment({
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            rawPayment: req.body
        });

        return res.status(200).json({
            success: true,
            message: "Payment verified and processed successfully",
            result
        });
    } catch (err) {
        console.error("Manual verify error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
}
