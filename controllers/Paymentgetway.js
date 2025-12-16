import Razorpay from "razorpay";
import crypto from "crypto";
import Wallet from "../models/Wallet.js";
import PaymentLog from "../models/PaymentLog.js";
import Transaction from "../models/Transaction.js";
import Plan from "../models/Plan.js";
import UserPlan from "../models/UserPlan.js";
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
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.user?._id;
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body;

        if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ message: "Missing payment details" });
        }

        // 🔐 Signature check
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_API_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            throw new Error("Invalid Razorpay signature");
        }

        // 🔁 Idempotency
        const alreadyDone = await Transaction.findOne({
            "external.paymentId": razorpay_payment_id,
            status: "success",
        });

        if (alreadyDone) {
            return res.status(409).json({ message: "Payment already processed" });
        }

        // 🔎 Fetch order details from Razorpay
        const order = await razorpay.orders.fetch(razorpay_order_id);
        const { type, planId } = order.notes;
        const amount = order.amount; // paise

        // 💼 Wallet
        const wallet = await Wallet.findOneAndUpdate(
            { userId },
            {},
            { new: true, upsert: true, session }
        );

        let transaction;

        // ==========================
        // 🟢 WALLET TOP-UP
        // ==========================
        if (type === "wallet_topup") {
            transaction = await Transaction.create(
                [{
                    walletId: wallet._id,
                    userId,
                    type: "topup",
                    direction: "credit",
                    amount,
                    balanceBefore: wallet.balance,
                    balanceAfter: wallet.balance + amount,
                    status: "success",
                    external: {
                        provider: "razorpay",
                        orderId: razorpay_order_id,
                        paymentId: razorpay_payment_id,
                    },
                }],
                { session }
            );

            wallet.balance += amount;
            wallet.lastTransactionAt = new Date();
            await wallet.save({ session });
        }

        // ==========================
        // 🔵 PLAN PURCHASE
        // ==========================
        if (type === "plan_purchase") {
            const plan = await Plan.findById(planId).session(session);
            if (!plan) throw new Error("Plan not found");

            transaction = await Transaction.create(
                [{
                    walletId: wallet._id,
                    userId,
                    type: "payment",
                    direction: "debit",
                    amount,
                    balanceBefore: wallet.balance,
                    balanceAfter: wallet.balance,
                    status: "success",
                    external: {
                        provider: "razorpay",
                        orderId: razorpay_order_id,
                        paymentId: razorpay_payment_id,
                    },
                    note: `Plan purchased: ${plan.name}`,
                }],
                { session }
            );

            // ⏳ Activate Plan
            const expiresAt = plan.validityDaysCoupons
                ? new Date(Date.now() + plan.validityDaysCoupons * 86400000)
                : null;

            await UserPlan.create(
                [{
                    userId,
                    planId: plan._id,
                    status: "active",
                    couponsAllowed: plan.couponsIncluded,
                    couponsUsed: 0,
                    startedAt: new Date(),
                    expiresAt,
                }],
                { session }
            );
        }

        // 🧾 Log
        await PaymentLog.create(
            [{
                userId,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                action: "verify_payment",
                status: "success",
            }],
            { session }
        );

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: "Payment verified successfully",
        });

    } catch (error) {
        await session.abortTransaction();

        console.error("Verify Payment Error:", error);

        await PaymentLog.create({
            userId: req.user?._id,
            orderId: req.body?.razorpay_order_id,
            paymentId: req.body?.razorpay_payment_id,
            action: "rollback",
            status: "failed",
            message: error.message,
        });

        res.status(500).json({ message: error.message });
    } finally {
        session.endSession();
    }
};

