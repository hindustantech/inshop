import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { validateCouponMiddleware } from "../middlewares/couponValidation.js";
import { getWalletSummary, getWalletTransactions } from "../controllers/walletController.js";
import { createTopup } from "../controllers/topupController.js";
import CouponController from "../controllers/couponshopController.js";

import { razorpayWebhookHandler } from "../controllers/webhookController.js";
// import { rawBodyMiddleware } from "../middleware/rawBody.js";
import { rawBodyMiddleware } from "../middlewares/rawBody.js";
const router = express.Router();

// Wallet routes
router.get("/wallet", authMiddleware, getWalletSummary);
router.get("/wallet/transactions", authMiddleware, getWalletTransactions);

// Top-up routes
router.post("/wallet/topup", authMiddleware, validateCouponMiddleware, createTopup);

// Coupon routes
router.post("/coupons/validate", authMiddleware, CouponController.validateCoupon);
router.get("/coupons/available", authMiddleware, CouponController.getAvailableCoupons);
router.get("/coupons/history", authMiddleware, CouponController.getCouponHistory);
router.post("/coupons/apply", authMiddleware, CouponController.applyCoupon);

// Webhook route — NO authMiddleware, uses rawBody middleware
router.post("/webhook/razorpay", rawBodyMiddleware, razorpayWebhookHandler);

export default router;