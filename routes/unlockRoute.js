import express from "express";
import { clickCouponController, getScanStatusController } from "../controllers/unlockCuopns.js";
import authMiddleware from "../middlewares/authMiddleware.js";
const router = express.Router();

/* ================================
   User Routes
================================ */

/**
 * Scan QR to unlock coupon
 * POST /api/v1/coupons/scan/:qrid
 */
router.post(
    "/scan/:qrid",
    authMiddleware,
    clickCouponController
);
router.get(
    "/getScanStatusController",
    authMiddleware,
    getScanStatusController
);

/* ================================
   Health / Debug (optional)
================================ */

router.get("/health", (req, res) => {
    res.status(200).json({ status: "coupon-service-ok" });
});

export default router;
