import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";

import Wallet from "../models/Wallet.js";
import TopUpAttempt from "../models/TopUpAttempt.js";
import Plan from "../models/Plan.js";
import RazorpayWebhook from "../models/RazorpayWebhook.js";
import { CouponService } from "./couponService.js";
import { ensureWallet, applyWalletTransaction } from "./walletService.js";
import { AppError, ValidationError, PaymentError } from "../utils/AppError.js";

export const razor = new Razorpay({
  key_id: process.env.RAZORPAY_API_KEY,
  key_secret: process.env.RAZORPAY_API_SECRET,
});


export function verifyRazorpaySignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET; // ✅ never fall back to API secret
  if (!secret) {
    console.error("❌ Missing RAZORPAY_WEBHOOK_SECRET in .env file");
    return false;
  }

  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")   // ✅ ensure UTF-8 encoding
      .digest("hex");

    const isValid = expected === signature;

    if (!isValid) {
      console.error("❌ Signature mismatch");
      console.error("Expected:", expected);
      console.error("Received:", signature);
    } else {
      console.log("✅ Razorpay webhook signature verified");
    }

    return isValid;
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return false;
  }
}

export async function createTopupOrder({
  userId,
  planId,
  amountINR,
  couponCode,
  idempotencyKey,
  metadata = {},
  userIp,
  userAgent
}) {
  console.log("🟢 [START] createTopupOrder called with:", {
    userId,
    planId,
    amountINR,
    couponCode,
    idempotencyKey,
    metadata,
    userIp,
    userAgent
  });

  // Step 1: Validation
  if (!userId) throw new ValidationError("userId is required");
  if (!planId && !amountINR) {
    throw new ValidationError("Either planId or amountINR is required");
  }
  console.log("✅ Validation passed for userId and plan/amount");

  let baseAmountPaise;
  let baseCreditAmountPaise;
  let currency = "INR";
  let plan = null;
  let couponResult = null;

  // Step 2: Fetch Plan (if planId provided)
  if (planId) {
    console.log(`🔍 Fetching plan details for planId: ${planId}`);
    plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      console.error("❌ Invalid or inactive plan:", planId);
      throw new ValidationError("Invalid or inactive plan");
    }
    console.log("✅ Plan fetched:", {
      planId: plan._id,
      price: plan.price,
      creditAmount: plan.creditAmount
    });
    baseAmountPaise = plan.price;
    baseCreditAmountPaise = plan.creditAmount;
    currency = plan.currency || "INR";
  } else {
    console.log(`💰 Manual amount mode: INR ${amountINR}`);
    baseAmountPaise = Math.round(amountINR * 100);
    baseCreditAmountPaise = baseAmountPaise;
  }

  // Step 3: Check idempotency
  if (idempotencyKey) {
    console.log(`🧩 Checking idempotency for key: ${idempotencyKey}`);
    const existingAttempt = await TopUpAttempt.findOne({ idempotencyKey });
    if (existingAttempt) {
      console.warn("⚠️ Existing top-up attempt found, returning cached result");
      return existingAttempt;
    }
  }

  // Start transaction
  const session = await mongoose.startSession();
  try {
    console.log("🟠 Transaction started...");
    session.startTransaction();

    // Step 4: Ensure wallet
    console.log("🔍 Ensuring wallet exists for user:", userId);
    const wallet = await ensureWallet(userId, session);
    console.log("✅ Wallet ready:", wallet._id);

    let finalAmountPaise = baseAmountPaise;
    let discountAmount = 0;
    let bonusAmount = 0;
    let creditAmount = baseCreditAmountPaise;
    let couponUsageId = null;
    let couponId = null;

    // Step 5: Apply coupon (if available)
    if (couponCode) {
      console.log(`🏷️ Applying coupon: ${couponCode}`);
      couponResult = await CouponService.validateAndApplyCoupon({
        couponCode,
        userId,
        planId,
        baseAmountPaise,
        userType: "existing_user",
        session
      });

      const { calculation, couponUsage } = couponResult;
      discountAmount = calculation.discountAmount;
      bonusAmount = calculation.bonusCredit;
      finalAmountPaise = calculation.finalAmount;
      creditAmount = calculation.finalCredit;
      couponUsageId = couponUsage._id;
      couponId = couponUsage.couponId;

      console.log("✅ Coupon applied:", {
        discountAmount,
        bonusAmount,
        finalAmountPaise,
        creditAmount
      });
    } else {
      console.log("🚫 No coupon applied");
    }

    // Step 6: Create Razorpay order
    console.log("💳 Creating Razorpay order...");

    // Razorpay receipt must be <= 40 chars
    const shortUserId = userId.toString().slice(-6);
    const shortTimestamp = Date.now().toString().slice(-6);
    const receipt = `tp_${shortUserId}_${shortTimestamp}`; // safe and short

    const order = await razor.orders.create({
      amount: finalAmountPaise,
      currency,
      receipt,
      notes: {
        userId: userId.toString(),
        planId: planId?.toString() || "manual",
        couponCode: couponCode || "none",
        discountAmount: discountAmount / 100,
        bonusAmount: bonusAmount / 100
      },
      payment_capture: 1
    });

    console.log("✅ Razorpay order created:", {
      orderId: order.id,
      receipt,
      amount: finalAmountPaise / 100,
      currency
    });

    // Step 7: Record TopUpAttempt
    console.log("📝 Recording TopUpAttempt...");
    const [topUp] = await TopUpAttempt.create(
      [
        {
          userId,
          walletId: wallet._id,
          planId: plan ? plan._id : undefined,
          planSnapshot: plan ? plan.toObject() : undefined,
          couponId,
          couponCode,
          couponUsageId,
          baseAmount: baseAmountPaise,
          discountAmount,
          bonusAmount,
          finalAmount: finalAmountPaise,
          creditAmount,
          provider: "razorpay",
          providerOrderId: order.id,
          currency,
          status: couponCode ? "coupon_applied" : "initiated",
          idempotencyKey,
          rawResponse: order,
          metadata: {
            ...metadata,
            appliedCoupon: couponCode || null,
            originalAmount: baseAmountPaise / 100,
            discountedAmount: finalAmountPaise / 100
          },
          userIp,
          userAgent
        }
      ],
      { session }
    );

    console.log("✅ TopUpAttempt record created:", topUp._id);

    // Step 8: Commit transaction
    await session.commitTransaction();
    console.log("🟢 Transaction committed successfully");

    console.log("🏁 [END] createTopupOrder completed successfully");
    return {
      topUp,
      order,
      couponApplied: !!couponCode,
      discountAmount: discountAmount / 100,
      bonusAmount: bonusAmount / 100
    };
  } catch (err) {
    console.error("❌ [ERROR] createTopupOrder failed:", err);
    await session.abortTransaction();
    throw err;
  } finally {
    console.log("🔚 Ending session...");
    session.endSession();
  }
}

export async function processSuccessfulPayment({
  razorpayOrderId,
  razorpayPaymentId,
  rawPayment
}) {
  if (!razorpayOrderId || !razorpayPaymentId) {
    throw new PaymentError("Missing payment identifiers");
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const topup = await TopUpAttempt
      .findOne({ providerOrderId: razorpayOrderId })
      .session(session);

    if (!topup) {
      throw new PaymentError("TopUpAttempt not found for this order", {
        razorpayOrderId,
      });
    }

    if (topup.status === "completed") {
      await session.commitTransaction();
      return { topup, alreadyProcessed: true };
    }

    // Check for duplicate transaction
    const existingTx = await mongoose.model("Transaction").findOne({
      "external.paymentId": razorpayPaymentId,
    }).session(session);

    if (existingTx) {
      if (topup.status !== "completed") {
        topup.status = "completed";
        topup.providerPaymentId = razorpayPaymentId;
        topup.rawResponse = rawPayment || topup.rawResponse;
        await topup.save({ session });
      }

      // Mark coupon as redeemed if exists
      if (topup.couponUsageId) {
        await CouponService.markCouponAsRedeemed({
          couponUsageId: topup.couponUsageId,
          topUpAttemptId: topup._id,
          session
        });
      }

      await session.commitTransaction();
      return { topup, transaction: existingTx, alreadyProcessed: true };
    }

    const wallet = await Wallet.findById(topup.walletId).session(session);
    if (!wallet) throw new AppError("Wallet not found for topup", 500);

    // Apply wallet transaction
    const tx = await applyWalletTransaction({
      session,
      wallet,
      userId: topup.userId,
      type: "topup",
      direction: "credit",
      amountPaise: topup.creditAmount,
      currency: topup.currency,
      external: {
        provider: "razorpay",
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
        raw: rawPayment,
      },
      idempotencyKey: topup.idempotencyKey,
      referenceId: topup._id.toString(),
      note: `Wallet top-up via Razorpay${topup.couponCode ? ` with coupon ${topup.couponCode}` : ''}`,
      metadata: {
        source: "razorpay_webhook",
        couponCode: topup.couponCode,
        discountAmount: topup.discountAmount,
        bonusAmount: topup.bonusAmount
      },
    });

    // Update top-up status
    topup.status = "completed";
    topup.providerPaymentId = razorpayPaymentId;
    topup.rawResponse = rawPayment || topup.rawResponse;
    await topup.save({ session });

    // Mark coupon as redeemed if exists
    if (topup.couponUsageId) {
      await CouponService.markCouponAsRedeemed({
        couponUsageId: topup.couponUsageId,
        topUpAttemptId: topup._id,
        session
      });
    }

    await session.commitTransaction();
    return { topup, transaction: tx, alreadyProcessed: false };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function storeAndProcessWebhook({ rawBody, body, signature }) {
  const isValid = verifyRazorpaySignature(rawBody, signature);

  const webhookDoc = await RazorpayWebhook.create({
    provider: "razorpay",
    event: body.event,
    payload: body,
    signature,
    processed: false,
  });

  if (!isValid) {
    webhookDoc.error = { message: "signature mismatch" };
    await webhookDoc.save();
    throw new PaymentError("Invalid Razorpay webhook signature");
  }

  try {
    const event = body.event;

    if (event === "payment.captured" || event === "payment.authorized") {
      const payment = body.payload.payment.entity;
      await processSuccessfulPayment({
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        rawPayment: payment,
      });
    }

    webhookDoc.processed = true;
    webhookDoc.processedAt = new Date();
    await webhookDoc.save();
    return webhookDoc;
  } catch (err) {
    webhookDoc.error = { message: err.message };
    webhookDoc.processed = false;
    await webhookDoc.save();
    throw err;
  }
}


export function verifyManualPaymentSignature({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature
}) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new Error("Missing required Razorpay parameters");
  }

  const secret = process.env.RAZORPAY_API_SECRET;
  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const isValid = expectedSignature === razorpay_signature;

  console.log("🔍 Manual verification:", {
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    expectedSignature,
    receivedSignature: razorpay_signature,
    valid: isValid,
  });

  return isValid;
}
