import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["global", "location", "user"], // 3 types
      required: true,
    },

    // For type === "location"
    location: {
      type: String, // e.g. "Delhi", "Mumbai"
    },

    // For type === "user"
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Target specific users
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Or 'User' if normal users can also send
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
