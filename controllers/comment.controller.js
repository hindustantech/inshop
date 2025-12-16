// controllers/comment.controller.js
import Coupon from "../models/coupunModel.js";
import CouponComment from "../models/CouponComment.js";

export const createComment = async (req, res) => {
    try {
        const { couponId } = req.params;
        const { rating, comment } = req.body;
        const userId = req.user._id;

        if (!rating || !comment) {
            return res.status(400).json({ message: "Rating and comment required" });
        }

        const coupon = await Coupon.findById(couponId).select("ownerId");
        if (!coupon) {
            return res.status(404).json({ message: "Coupon not found" });
        }

        const newComment = await CouponComment.create({
            couponId,
            ownerId: coupon.ownerId, // ✅ denormalized
            userId,
            rating,
            comment,
        });

        res.status(201).json({
            success: true,
            message: "Comment added successfully",
            data: newComment,
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                message: "You already commented on this coupon",
            });
        }
        res.status(500).json({ message: err.message });
    }
};

export const replyToComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { reply } = req.body;
        const ownerId = req.user._id;

        const comment = await CouponComment.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        if (comment.ownerId.toString() !== ownerId.toString()) {
            return res.status(403).json({
                message: "Only coupon owner can reply",
            });
        }

        comment.ownerReply = {
            reply,
            repliedBy: ownerId,
            repliedAt: new Date(),
        };

        await comment.save();

        res.json({
            success: true,
            message: "Reply added successfully",
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getComments = async (req, res) => {
    const { couponId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const comments = await CouponComment.find({
        couponId,
        status: "ACTIVE",
    })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name avatar")
        .populate("ownerReply.repliedBy", "name")
        .lean();

    res.json({
        page,
        limit,
        count: comments.length,
        data: comments,
    });
};

