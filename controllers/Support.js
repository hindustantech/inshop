import mongoose from "mongoose";
import supports from "../models/supports.js";



/**
 * ================================
 * Create Message
 * ================================
 * POST /api/v1/messages
 */
export const createMessage = async (req, res) => {
  try {
    const userId = req.user?.id; // injected by auth middleware
    const { message } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    const newMessage = await supports.create({
      userId,
      message: message.trim(),
    });

    return res.status(201).json({
      success: true,
      data: newMessage,
    });
  } catch (error) {
    console.error("Create Message Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * ================================
 * Get All Messages (Paginated)
 * ================================
 * GET /api/v1/messages?page=1&limit=20
 */
export const getMessages = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      supports.find()
        .populate("userId", "fullName email photo")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      supports.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: messages,
    });
  } catch (error) {
    console.error("Get Messages Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * ================================
 * Get Messages By User
 * ================================
 * GET /api/v1/messages/user/:userId
 */
export const getMessagesByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const messages = await supports.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Get Messages By User Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * ================================
 * Delete Message
 * ================================
 * DELETE /api/v1/messages/:messageId
 */
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const requesterId = req.user?.id;
    const role = req.user?.role; // user | admin | super_admin

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID",
      });
    }

    const message = await supports.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Ownership or admin check
    if (
      message.userId.toString() !== requesterId &&
      !["admin", "super_admin"].includes(role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    await message.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete Message Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
