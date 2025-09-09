import admin from '../utils/firebaseadmin.js';
import User from '../models/userModel.js';

export const SendNotification = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { title, body } = req.body;

    // Fetch user
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure user has a device token
    if (!user.deviceToken) {
      return res.status(400).json({ message: "User does not have a device token" });
    }

    // Notification payload
    const message = {
      notification: {
        title,
        body,
      },
      token: user.devicetoken,
    };

    // Send notification
    const response = await admin.messaging().send(message);

    return res.status(200).json({
      success: true,
      message: "Notification sent successfully",
      response,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    return res.status(500).json({ success: false, message: "Failed to send notification", error });
  }
};