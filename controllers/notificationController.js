import notification from "../models/notification.js";
import User from "../models/userModel.js";
// ✅ Create Notification
export const createNotification = async (req, res) => {
    try {
        const { title, message, type, location, users } = req.body;
        const createdBy = req.user?._id || req.user.id; // assuming JWT auth middleware

        // Validation based on type
        if (type === "location" && !location) {
            return res.status(400).json({ error: "Location is required for location notifications" });
        }
        if (type === "user" && (!users || users.length === 0)) {
            return res.status(400).json({ error: "Users are required for user-specific notifications" });
        }

        const notification = await Notification.create({
            title,
            message,
            type,
            location: type === "location" ? location : undefined,
            users: type === "user" ? users : [],
            createdBy,
        });

        res.status(201).json({
            success: true,
            message: "Notification created successfully",
            data: notification,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ✅ Get Notifications for a User
export const getNotifications = async (req, res) => {
    try {
        const userId = req.user._id; // assuming user logged in
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Fetch notifications that match:
        // 1. Global
        // 2. Location (if user has location)
        // 3. User-specific
        const notifications = await Notification.find({
            $or: [
                { type: "global" },
                { type: "location", location: user.manul_address }, // assuming user has a `location` field
                { type: "user", users: userId },
            ],
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
