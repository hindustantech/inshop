import Razorpay from "razorpay";
import crypto from "crypto";
import Wallet from "../models/Wallet.js";
import PaymentLog from "../models/PaymentLog.js";

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

            await Wallet.updateOne(
                { userId, "transactions.orderId": razorpay_order_id },
                {
                    $set: {
                        "transactions.$.status": "failed",
                        "transactions.$.meta": { reason: "Signature mismatch" },
                    },
                }
            );

            return res.status(400).json({
                success: false,
                message: "Invalid payment signature.",
            });
        }

        // ✅ Step 1: Wallet Upsert
        const wallet = await Wallet.findOneAndUpdate(
            { userId },
            {},
            { new: true, upsert: true }
        );

        // ✅ Step 2: Check for duplicate transaction
        const existingTx = wallet.transactions.find(
            (t) => t.transactionId === razorpay_payment_id
        );
        if (existingTx && existingTx.status === "success") {
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

        // ✅ Step 3: Add/Update Transaction (Pending → Success)
        const transactionIndex = wallet.transactions.findIndex(
            (t) => t.orderId === razorpay_order_id
        );

        if (transactionIndex === -1) {
            wallet.transactions.push({
                type: "credit",
                amount,
                description: "Wallet top-up via Razorpay",
                orderId: razorpay_order_id,
                transactionId: razorpay_payment_id,
                status: "pending",
            });
        } else {
            wallet.transactions[transactionIndex].transactionId = razorpay_payment_id;
            wallet.transactions[transactionIndex].status = "pending";
        }
        await wallet.save();

        // ✅ Step 4: Atomic Wallet Credit + Status Update
        const updatedWallet = await Wallet.findOneAndUpdate(
            { userId },
            {
                $inc: { balance: amount },
                $set: {
                    "transactions.$[tx].status": "success",
                    "transactions.$[tx].updatedAt": new Date(),
                },
            },
            {
                arrayFilters: [{ "tx.orderId": razorpay_order_id }],
                new: true,
            }
        );

        // ✅ Step 5: Log successful verification
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
            wallet: updatedWallet,
        });
    } catch (error) {
        console.error("❌ [Verify Payment Error]:", error);

        // ✅ Log rollback
        await PaymentLog.create({
            userId: req.body?.userId,
            orderId: req.body?.razorpay_order_id,
            paymentId: req.body?.razorpay_payment_id,
            action: "rollback",
            status: "failed",
            message: "Error during verification, transaction rolled back",
            details: { error: error.message },
        });

        await Wallet.updateOne(
            { userId: req.body?.userId, "transactions.orderId": req.body?.razorpay_order_id },
            {
                $set: {
                    "transactions.$.status": "failed",
                    "transactions.$.meta": { error: error.message },
                },
            }
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error during payment verification",
        });
    }
};
