import Razorpay from "razorpay";
import crypto from "crypto";
import Wallet from "../models/Wallet.js";
import PaymentLog from "../models/PaymentLog.js";
import Transaction from "../models/Transaction.js";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_API_KEY,
    key_secret: process.env.RAZORPAY_API_SECRET,
});

/* -------------------------------------------------------------------------- */
/*                              1️⃣ CREATE ORDER                              */
/* -------------------------------------------------------------------------- */
export const createOrder = async (req, res) => {
    try {
        const { amount, currency = "INR", receipt, notes = {} } = req.body;

        if (!amount || typeof amount !== "number" || amount <= 0) {
            return res.status(400).json({ success: false, message: "Invalid amount" });
        }

        const receiptId = receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

        const options = {
            amount: Math.round(amount * 100),
            currency: currency.toUpperCase(),
            receipt: receiptId,
            notes: {
                ...notes,
                requestedBy: req.user?._id || "unknown",
            },
        };

        const order = await razorpay.orders.create(options);

        // ✅ Log order creation
        await PaymentLog.create({
            userId: req.user?._id,
            orderId: order.id,
            action: "create_order",
            status: "pending",
            details: order,
            message: "Order created successfully",
        });

        return res.status(201).json({
            success: true,
            message: "Order created successfully",
            order,
        });
    } catch (error) {
        console.error("❌ [Razorpay - Create Order Error]:", error);

        await PaymentLog.create({
            action: "create_order",
            status: "failed",
            message: error.message,
        });

        return res.status(500).json({
            success: false,
            message: "Server error while creating order",
        });
    }
};

/* -------------------------------------------------------------------------- */
/*                            2️⃣ VERIFY PAYMENT                              */
/* -------------------------------------------------------------------------- */
export const verifyPayment = async (req, res) => {
    try {
        const userId = req.user?._id;
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount,
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId || !amount) {
            return res.status(400).json({
                success: false,
                message: "Missing payment or user details",
            });
        }

        // ✅ Step 1: Validate Signature
        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_API_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            await PaymentLog.create({
                userId,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                action: "verify_payment",
                status: "failed",
                message: "Invalid signature during verification",
            });

            return res.status(400).json({
                success: false,
                message: "Invalid payment signature.",
            });
        }

        // ✅ Step 2: Ensure Wallet Exists
        const wallet = await Wallet.findOneAndUpdate(
            { userId },
            {},
            { new: true, upsert: true }
        );

        // ✅ Step 3: Check for duplicate transaction (idempotency)
        const existingTx = await Transaction.findOne({
            userId,
            "external.paymentId": razorpay_payment_id,
            status: "success",
        });

        if (existingTx) {
            await PaymentLog.create({
                userId,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                action: "verify_payment",
                status: "success",
                message: "Duplicate payment ignored (already credited)",
            });

            return res.status(409).json({
                success: false,
                message: "Payment already processed.",
            });
        }

        // ✅ Step 4: Create or Update Pending Transaction
        let transaction = await Transaction.findOneAndUpdate(
            {
                userId,
                "external.orderId": razorpay_order_id,
            },
            {
                $set: {
                    walletId: wallet._id,
                    type: "topup",
                    direction: "credit",
                    amount,
                    balanceBefore: wallet.balance,
                    balanceAfter: wallet.balance + amount,
                    currency: wallet.currency || "INR",
                    status: "pending",
                    external: {
                        provider: "razorpay",
                        paymentId: razorpay_payment_id,
                        orderId: razorpay_order_id,
                    },
                    note: "Wallet top-up via Razorpay",
                },
            },
            { new: true, upsert: true }
        );

        // ✅ Step 5: Update wallet balance and transaction to success
        wallet.balance += amount;
        wallet.lastTransactionAt = new Date();
        await wallet.save();

        transaction.status = "success";
        transaction.balanceAfter = wallet.balance;
        await transaction.save();

        // ✅ Step 6: Log success
        await PaymentLog.create({
            userId,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            action: "verify_payment",
            status: "success",
            message: "Payment verified and wallet credited successfully",
            details: { creditedAmount: amount },
        });

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully. Wallet updated.",
            wallet,
        });
    } catch (error) {
        console.error("❌ [Verify Payment Error]:", error);

        await PaymentLog.create({
            userId: req.user?._id || req.body?.userId,
            orderId: req.body?.razorpay_order_id,
            paymentId: req.body?.razorpay_payment_id,
            action: "rollback",
            status: "failed",
            message: "Error during verification, transaction rolled back",
            details: { error: error.message },
        });

        await Transaction.updateOne(
            {
                userId: req.user?._id || req.body?.userId,
                "external.orderId": req.body?.razorpay_order_id,
            },
            { $set: { status: "failed", metadata: { error: error.message } } }
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error during payment verification",
        });
    }
};
