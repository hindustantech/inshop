import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
import mongoose from "mongoose";
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
    try {
        const userId = req.user._id;
        const { couponId } = req.params;
        const now = new Date();
        const coupon = await Coupon.findOne({
            _id: couponId,
            isGiftHamper: true,
            active: true,
            activeLocks: {
                $elemMatch: {
                    userId: new mongoose.Types.ObjectId(userId),
                    lockExpiresAt: { $gt: now }
                }
            }
        });
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "No valid gift hamper lock found for this coupon"
            });
        }
        // Mark coupon as redeemed for this user
        const salesRecord = new Sales({
            couponId: coupon._id,
            userId: userId,
            serviceStartTime: now,
            status: "completed",
            amount: coupon.originalPrice,
            discountAmount: coupon.discountAmount,
            finalAmount: coupon.finalPrice
        });
        await salesRecord.save();
        // Remove user's lock from coupon
        coupon.activeLocks = coupon.activeLocks.filter(
            l => l.userId.toString() !== userId.toString()
        );
        await coupon.save();
        return res.status(200).json({
            success: true,
            message: "Gift hamper redeemed successfully"
        });

    }
    catch (error) {
        console.error("Redeem Gift Hamper Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error during gift hamper redemption"
        });
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
