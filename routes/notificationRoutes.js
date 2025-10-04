import express from "express";
import { createNotification,getNotifications } from "../controllers/notificationController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
const router = express.Router();

/**
 * @route   POST /api/notifications
 * @desc    Create a new notification
 * @access  Admin only
 */
router.post("/", authMiddleware, createNotification);

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for logged-in user
 * @access  Private (logged-in users)
 */
router.get("/", authMiddleware, getNotifications);

export default router;
