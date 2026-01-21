import express from "express";
import {
    transferGiftHamperLock,
    lockGiftHamperController,
    redeemGiftHamper,
    getMyLockedGiftHampers,
    getGiftHamperLockCheckController
} from "../controllers/GiftHamper.js";

import authMiddleware from "../middlewares/authMiddleware.js";
const router = express.Router();

// All routes require authentication
router.use(authMiddleware);
// POST /api/gift-hampers/lock - Lock a gift hamper
router.post("/lock", lockGiftHamperController);

// POST /api/gift-hampers/:couponId/transfer - Transfer gift hamper lock to another user
router.post("/:couponId/transfer", transferGiftHamperLock);

// POST /api/gift-hampers/:couponId/redeem - Redeem a gift hamper
router.post("/redeem", redeemGiftHamper);

// GET /api/gift-hampers/my-locked - Get user's locked gift hampers
router.get("/my-locked", getMyLockedGiftHampers);

// GET /api/gift-hampers/lock-check - Check lock eligibility status
router.get("/lock-check", getGiftHamperLockCheckController);

export default router;