import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key"; // keep this secret in env
/* ================= CONTROLLER ================= */

export const transferGiftHamperLock = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const fromUserId = req.user._id; // Person A (auth user)
        const { couponId } = req.params;
        const { toUserId } = req.body;

        if (!mongoose.isValidObjectId(toUserId)) {
            return res.status(400).json({ success: false, message: "Invalid target user" });
        }

        const coupon = await Coupon.findOne({
            _id: couponId,
            isGiftHamper: true,
            active: true
        }).session(session);

        if (!coupon) {
            return res.status(404).json({ success: false, message: "Gift Hamper not found" });
        }


        // 2. Idempotency check
        const existingSale = await Sales.findOne({
            couponId: coupon._id,
            userId: toUserId,
            status: "completed"
        }).session(session);

        if (existingSale) {
            await session.abortTransaction();
            return res.status(409).json({
                success: false,
                message: " you can`t trnasfer Gift hamper already redeemed"
            });
        }
        // 1. Check sender owns lock
        const senderLockIndex = coupon.activeLocks.findIndex(
            l => l.userId.toString() === fromUserId.toString()
        );

        if (senderLockIndex === -1) {
            return res.status(403).json({
                success: false,
                message: "You do not own this gift hamper"
            });
        }

        // 2. Prevent assigning to same user
        if (fromUserId.toString() === toUserId.toString()) {
            return res.status(400).json({
                success: false,
                message: "Cannot assign to yourself"
            });
        }

        // 3. Check receiver already has lock
        const receiverAlreadyLocked = coupon.activeLocks.some(
            l => l.userId.toString() === toUserId.toString()
        );

        if (receiverAlreadyLocked) {
            return res.status(409).json({
                success: false,
                message: "Target user already owns this gift hamper"
            });
        }

        // 4. Extract sender lock data
        const senderLock = coupon.activeLocks[senderLockIndex];

        // 5. Remove sender lock
        coupon.activeLocks.splice(senderLockIndex, 1);

        // 6. Add receiver lock (new owner)
        coupon.activeLocks.push({
            userId: toUserId,
            lockedAt: new Date(),
            lockDurationDays: senderLock.lockDurationDays,
            lockExpiresAt: senderLock.lockExpiresAt
        });



        await coupon.save({ session });

        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: "Gift hamper successfully assigned to new user"
        });

    } catch (error) {
        await session.abortTransaction();

        console.error("Transfer Gift Hamper Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error during gift hamper transfer"
        });

    } finally {
        session.endSession();
    }
};

S
const REQUIRED_COMPLETED_SALES = 3;

export const lockGiftHamperController = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const userId = req.user?._id;
        const { couponId, lockDurationDays = 30 } = req.body;

        if (!userId || !mongoose.isValidObjectId(couponId)) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Invalid user or coupon"
            });
        }

        /* ------------------------------------------------
           STEP 1: Get user's last lock time (if any)
        ------------------------------------------------ */

        const lastLock = await Coupon.findOne(
            {
                "activeLocks.userId": userId
            },
            {
                activeLocks: {
                    $elemMatch: { userId }
                }
            }
        )
            .sort({ "activeLocks.lockedAt": -1 })
            .session(session);

        let lastLockTime = null;

        if (lastLock?.activeLocks?.length) {
            lastLockTime = lastLock.activeLocks[0].lockedAt;
        }

        /* ------------------------------------------------
           STEP 2: Count completed sales AFTER last lock
        ------------------------------------------------ */

        const salesQuery = {
            userId,
            status: "completed"
        };

        if (lastLockTime) {
            salesQuery.createdAt = { $gt: lastLockTime };
        }

        const completedSalesCount = await Sales.countDocuments(salesQuery).session(session);

        if (completedSalesCount < REQUIRED_COMPLETED_SALES) {
            await session.abortTransaction();
            return res.status(403).json({
                success: false,
                message: `You need ${REQUIRED_COMPLETED_SALES - completedSalesCount} more completed sales to unlock next gift hamper`,
                completedSalesCount,
                required: REQUIRED_COMPLETED_SALES
            });
        }

        /* ------------------------------------------------
           STEP 3: Prepare lock record
        ------------------------------------------------ */

        const now = new Date();
        const expiresAt = new Date(now.getTime() + lockDurationDays * 86400000);

        const lockRecord = {
            userId,
            lockedAt: now,
            lockDurationDays,
            lockExpiresAt: expiresAt
        };

        /* ------------------------------------------------
           STEP 4: Atomic coupon lock
        ------------------------------------------------ */

        const updatedCoupon = await Coupon.findOneAndUpdate(
            {
                _id: couponId,
                isGiftHamper: true,
                active: true,
                status: "published",
                lockCoupon: true,

                $or: [
                    { activeLocks: { $size: 0 } },
                    {
                        activeLocks: {
                            $not: {
                                $elemMatch: {
                                    userId: new mongoose.Types.ObjectId(userId),
                                    lockExpiresAt: { $gt: now }
                                }
                            }
                        }
                    }
                ],

                $expr: {
                    $or: [
                        { $eq: ["$maxDistributions", 0] },
                        { $lt: ["$currentDistributions", "$maxDistributions"] }
                    ]
                }
            },
            {
                $push: { activeLocks: lockRecord },
                $inc: { currentDistributions: 1 }
            },
            {
                new: true,
                session
            }
        );

        if (!updatedCoupon) {
            await session.abortTransaction();
            return res.status(409).json({
                success: false,
                message: "Coupon already locked or unavailable"
            });
        }

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Gift hamper locked successfully",
            expiresAt
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("Gift Hamper Lock Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to lock gift hamper"
        });
    }
};



export const redeemGiftHamper = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = new mongoose.Types.ObjectId(req.user._id);
        const { couponId, owner } = req.body;

        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(400).json({ success: false, message: "Invalid Coupon ID" });
        }

        if (!owner) {
            return res.status(400).json({ success: false, message: "Invalid Owner Token" });
        }

        // ✅ Verify owner token
        const decoded = jwt.verify(owner, JWT_SECRET);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ message: "Invalid or expired owner token" });
        }

        const ownerUser = await User.findById(decoded.userId);
        if (!ownerUser) {
            return res.status(401).json({ message: "Owner not found, authorization denied" });
        }


        const now = new Date();

        // 1. Find coupon with valid lock AND distribution available
        const coupon = await Coupon.findOne({
            _id: couponId,
            isGiftHamper: true,
            active: true,
            $or: [
                { maxDistributions: 0 }, // unlimited
                { $expr: { $lt: ["$currentDistributions", "$maxDistributions"] } }
            ],
            activeLocks: {
                $elemMatch: {
                    userId,
                    lockExpiresAt: { $gt: now }
                }
            }
        }).session(session);

        if (!coupon) {
            await session.abortTransaction();
            return res.status(409).json({
                success: false,
                message: "Gift hamper unavailable, expired, fully redeemed, or lock not valid"
            });
        }

        // 2. Idempotency check
        const existingSale = await Sales.findOne({
            couponId: coupon._id,
            userId,
            status: "completed"
        }).session(session);

        if (existingSale) {
            await session.abortTransaction();
            return res.status(409).json({
                success: false,
                message: "Gift hamper already redeemed"
            });
        }

        // 3. Create sales record
        await Sales.create([{
            couponId: coupon._id,
            userId,
            serviceStartTime: now,
            status: "completed",
            amount: coupon.originalPrice || coupon.worthGift,
            discountAmount: coupon.discountAmount || 0,
            finalAmount: coupon.finalPrice || 0
        }], { session });

        // 4. Atomic update: remove lock + increment distribution
        const updateResult = await Coupon.updateOne(
            {
                _id: coupon._id,
                $or: [
                    { maxDistributions: 0 },
                    { $expr: { $lt: ["$currentDistributions", "$maxDistributions"] } }
                ]
            },
            {
                $pull: { activeLocks: { userId } },
                $inc: { currentDistributions: 1 }
            },
            { session }
        );

        if (updateResult.modifiedCount !== 1) {
            throw new Error("Distribution limit reached during redemption");
        }

        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: "Gift hamper redeemed successfully"
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Redeem Gift Hamper Error:", error);

        return res.status(500).json({
            success: false,
            message: "Gift hamper redemption failed"
        });
    } finally {
        session.endSession();
    }
};



export const getMyLockedGiftHampers = async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        const giftHampers = await Coupon.find({
            isGiftHamper: true,
            active: true,
            status: "published",
            activeLocks: {
                $elemMatch: {
                    userId: new mongoose.Types.ObjectId(userId),
                    lockExpiresAt: { $gt: now }
                }
            }
        })
            .select("-promotion -__v")
            .lean();

        return res.status(200).json({
            success: true,
            count: giftHampers.length,
            data: giftHampers
        });

    } catch (error) {
        console.error("Get Locked Gift Hampers Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch locked gift hampers"
        });
    }
};




export const getGiftHamperLockCheckController = async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        /* -------------------------------------------
           STEP 1: Fetch user's last lock time
        ------------------------------------------- */

        const lastLockDoc = await Coupon.findOne(
            { "activeLocks.userId": userId },
            { activeLocks: { $elemMatch: { userId } } }
        ).sort({ "activeLocks.lockedAt": -1 });

        let lastLockTime = null;
        if (lastLockDoc?.activeLocks?.length) {
            lastLockTime = lastLockDoc.activeLocks[0].lockedAt;
        }

        /* -------------------------------------------
           STEP 2: Count total completed sales
        ------------------------------------------- */

        const totalCompletedSales = await Sales.countDocuments({
            userId,
            status: "completed"
        });

        /* -------------------------------------------
           STEP 3: Count completed sales after last lock
        ------------------------------------------- */

        const salesQuery = {
            userId,
            status: "completed"
        };

        if (lastLockTime) {
            salesQuery.createdAt = { $gt: lastLockTime };
        }

        const completedSalesAfterLastLock = await Sales.countDocuments(salesQuery);

        /* -------------------------------------------
           STEP 4: Count total locks
        ------------------------------------------- */

        const totalGiftHampersLocked = await Coupon.countDocuments({
            "activeLocks.userId": userId
        });

        /* -------------------------------------------
           STEP 5: Compute eligibility
        ------------------------------------------- */

        const remainingForNextLock = Math.max(
            REQUIRED_COMPLETED_SALES - completedSalesAfterLastLock,
            0
        );

        const canLock = completedSalesAfterLastLock >= REQUIRED_COMPLETED_SALES;

        return res.status(200).json({
            success: true,
            canLock,
            stats: {
                totalCompletedSales,
                completedSalesAfterLastLock,
                totalGiftHampersLocked,
                requiredForNextLock: REQUIRED_COMPLETED_SALES,
                remainingForNextLock,
                lastLockTime
            }
        });

    } catch (error) {
        console.error("Gift Hamper Lock Check Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to check gift hamper lock eligibility"
        });
    }
};
