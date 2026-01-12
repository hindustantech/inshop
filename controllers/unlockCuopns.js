import mongoose from "mongoose";
import { CouponClick } from "../models/unlock.js";
import { CouponUnlock } from "../models/couponUnlock.js";
import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
/* ================= CONFIG ================= */

const UNLOCK_VALIDITY_HOURS = 24;
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key"; // keep this secret in env


const MAX_CLICKS = 3;
const MIN_CLICK_INTERVAL_MS = 30 * 60 * 1000;
/* ================= RESPONSE HELPERS ================= */

const ok = (res, data, message = "Success") =>
    res.status(200).json({ success: true, message, data });

const bad = (res, message, code = 400) =>
    res.status(code).json({ success: false, message });

/* ================= CONTROLLER ================= */

export const clickCouponController = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const userId = req.user?.id || req.body.userId;
        const { qrid } = req.params;

        if (!userId || !qrid) {
            return bad(res, "userId and qrid are required");
        }

        const now = new Date();

        /* 1. Validate QR owner */

        // ✅ Verify owner token
        const decoded = jwt.verify(qrid, JWT_SECRET);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ message: "Invalid or expired owner token" });
        }


        const qrOwner = await User.findById(decoded.userId).session(session);
        if (!qrOwner) return bad(res, "Invalid QR code", 404);

        if (String(userId) === String(qrid)) {
            return bad(res, "Self scanning is not allowed");
        }

        /* 2. Check existing active coupon */
        const activeCoupon = await CouponUnlock.findOne({
            userId,
            status: "ACTIVE",
            expiresAt: { $gt: now }
        }).session(session);

        if (activeCoupon) {
            return ok(res, {
                unlocked: true,
                expiresAt: activeCoupon.expiresAt
            }, "Coupon already unlocked");
        }

        /* 3. Load or create click session */
        let clickSession = await CouponClick.findOne({ userId }).session(session);

        if (!clickSession) {
            clickSession = new CouponClick({
                userId,
                meta: {
                    ipAddress: req.ip,
                    userAgent: req.headers["user-agent"]
                }
            });
        }

        if (clickSession.status === "BLOCKED") {
            return bad(res, "Session blocked due to abuse");
        }

        /* 4. Enforce scan interval */
        if (clickSession.lastClickAt) {
            const diff = now - clickSession.lastClickAt;

            if (diff < MIN_CLICK_INTERVAL_MS) {
                const waitMinutes = Math.ceil((MIN_CLICK_INTERVAL_MS - diff) / 60000);
                return bad(res, `Next scan allowed after ${waitMinutes} minutes`);
            }
        }

        /* 5. Register scan */
        clickSession.clickCount += 1;
        clickSession.lastClickAt = now;
        clickSession.clickTimestamps.push(now);

        let unlocked = false;
        let expiresAt = null;

        /* 6. Unlock logic */
        if (clickSession.clickCount >= MAX_CLICKS) {

            unlocked = true;
            expiresAt = new Date(now.getTime() + UNLOCK_VALIDITY_HOURS * 3600000);

            clickSession.isUnlocked = true;
            clickSession.unlockAt = now;
            clickSession.status = "UNLOCKED";
            clickSession.expiresAt = expiresAt;

            await CouponUnlock.create([{
                userId,
                unlockedAt: now,
                expiresAt,
                unlockMethod: "THREE_SCAN",
                status: "ACTIVE"
            }], { session });
        }

        await clickSession.save({ session });

        await session.commitTransaction();

        return ok(res, {
            unlocked,
            clicks: clickSession.clickCount,
            remaining: Math.max(0, MAX_CLICKS - clickSession.clickCount),
            nextAllowedAt: new Date(now.getTime() + MIN_CLICK_INTERVAL_MS),
            expiresAt
        }, unlocked ? "Coupon unlocked successfully" : "Scan registered");

    } catch (err) {
        await session.abortTransaction();

        if (err.code === 11000) {
            return bad(res, "Coupon already unlocked");
        }

        console.error("Coupon unlock error:", err);
        return bad(res, "Internal server error", 500);

    } finally {
        session.endSession();
    }
};



export const getScanStatusController = async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        const clickSession = await CouponClick.findOne({ userId }).lean();

        let activeCoupon = await CouponUnlock.findOne({
            userId,
            status: "ACTIVE",
            expiresAt: { $gt: now }
        }).lean();

        if (!clickSession) {
            return res.status(200).json({
                success: true,
                data: {
                    status: "NOT_STARTED",
                    totalRequired: MAX_CLICKS,
                    completed: 0,
                    remaining: MAX_CLICKS,
                    nextAllowedAt: now,
                    unlocked: false
                }
            });
        }

        let nextAllowedAt = now;

        if (clickSession.lastClickAt) {
            const diff = now - new Date(clickSession.lastClickAt);

            if (diff < MIN_CLICK_INTERVAL_MS) {
                nextAllowedAt = new Date(
                    clickSession.lastClickAt.getTime() + MIN_CLICK_INTERVAL_MS
                );
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                status: clickSession.status,
                totalRequired: MAX_CLICKS,
                completed: clickSession.clickCount,
                remaining: Math.max(0, MAX_CLICKS - clickSession.clickCount),
                nextAllowedAt,
                unlocked: !!activeCoupon,
                couponExpiresAt: activeCoupon?.expiresAt || null
            }
        });

    } catch (err) {
        console.error("getScanStatusController error:", err);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};



