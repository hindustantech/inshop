import express from "express";
import {
    createComment,
    getComments,
    replyToComment,
} from "../controllers/comment.controller.js";
import authMiddleware from "../middlewares/authMiddleware.js";
const router = express.Router();

/**
 * -------------------------
 * Coupon Comments
 * -------------------------
 */

// ➕ Create a comment on a coupon (User)
router.post(
    "/coupons/:couponId/comments",
    authMiddleware,
    createComment
);

// 📥 Get all comments for a coupon (Public)
router.get(
    "/coupons/:couponId/comments",
    getComments
);

// 💬 Reply to a comment (ONLY Coupon Owner)
router.post(
    "/comments/:commentId/reply",
    authMiddleware,
    replyToComment
);

export default router;
