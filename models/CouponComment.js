// models/CouponComment.js
import mongoose from "mongoose";

const couponCommentSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
      index: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    comment: {
      type: String,
      required: true,
      trim: true,
    },

    ownerReply: {
      reply: String,
      repliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      repliedAt: Date,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "HIDDEN", "DELETED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

couponCommentSchema.index({ couponId: 1, userId: 1 }, { unique: true });

export default mongoose.model("CouponComment", couponCommentSchema);
