import { createTopupOrder } from "../services/paymentService.js";
import { AppError, ValidationError } from "../utils/AppError.js";
import TopUpAttempt from "../models/TopUpAttempt.js";

export async function createTopup(req, res, next) {
  try {
    const userId = req.user._id;
    const { planId, amountINR, couponCode, idempotencyKey, metadata } = req.body;

    const userIp = req.ip;
    const userAgent = req.headers["user-agent"];

    const result = await createTopupOrder({
      userId,
      planId,
      amountINR,
      couponCode,
      idempotencyKey,
      metadata,
      userIp,
      userAgent
    });
    console.log("result", result);
    return res.json({
      success: true,
      data: {
        topUpAttemptId: result.topUp._id,
        orderId: result.order.id,
        amount: result.topUp.finalAmount,
        creditAmount: result.topUp.creditAmount,
        currency: result.topUp.currency,
        couponApplied: result.couponApplied,
        discountAmount: result.discountAmount,
        bonusAmount: result.bonusAmount,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        orderDetails: {
          amount: result.order.amount,
          currency: result.order.currency,
          receipt: result.order.receipt
        }
      },
    });
  } catch (err) {
    next(err);
  }
}


export async function getPaymentStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const topup = await TopUpAttempt.findOne({
      providerOrderId: orderId,
      userId: userId
    }).lean();

    if (!topup) {
      throw new AppError("Payment not found", 404);
    }

    res.json({
      success: true,
      data: {
        orderId,
        status: topup.status,
        amount: topup.finalAmount / 100,
        creditAmount: topup.creditAmount / 100,
        createdAt: topup.createdAt,
        updatedAt: topup.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
}