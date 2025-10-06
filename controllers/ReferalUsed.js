import ReferralUsage from "../models/ReferralUsage.js";
import User from "../models/userModel.js";
import Sales from "../models/Sales.js";

export const getReferralUsersByDate = async (req, res) => {
    try {
        const { from, to, page = 1, limit = 20 } = req.query; // default page 1, limit 20
        const { id } = req.body;

        // Step 1: Get referral code of user
        const user = await User.findById(id, "referalCode").lean();
        if (!user || !user.referalCode) {
            return res.status(400).json({
                success: false,
                message: "Invalid user or referral code not assigned",
            });
        }

        const referralCode = user.referalCode;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Step 2: Build match condition dynamically
        const matchCondition = { referralCode };
        if (from || to) {
            matchCondition.dateUsed = {};
            if (from) matchCondition.dateUsed.$gte = new Date(from);
            if (to) matchCondition.dateUsed.$lte = new Date(to);
        }

        // Step 3: Aggregation pipeline with pagination
        const [result, totalCount] = await Promise.all([
            ReferralUsage.aggregate([
                { $match: matchCondition },
                {
                    $lookup: {
                        from: "users",
                        localField: "referredUserId",
                        foreignField: "_id",
                        as: "referredUser",
                    },
                },
                { $unwind: { path: "$referredUser", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        name: { $ifNull: ["$referredUser.name", "Unknown"] },
                        email: { $ifNull: ["$referredUser.email", "N/A"] },
                        dateUsed: 1,
                    },
                },
                { $sort: { dateUsed: -1 } },
                { $skip: skip },
                { $limit: parseInt(limit) },
            ]),
            ReferralUsage.countDocuments(matchCondition),
        ]);

        return res.status(200).json({
            success: true,
            referralCode,
            totalRegisteredUsers: totalCount,
            page: parseInt(page),
            limit: parseInt(limit),
            users: result,
        });
    } catch (error) {
        console.error("Error fetching referral users:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};




export const getCompletedSalesByReferral = async (req, res) => {
    try {
        const { from, to } = req.query;
        const { id } = req.body;

        // Step 1: Fetch user with referral info
        const user = await User.findById(id, "name email referalCode referrelCommisationType referrelCommisation");
        if (!user || !user.referalCode) {
            return res.status(400).json({
                success: false,
                message: "Invalid user or referral code not assigned",
            });
        }

        const referralCode = user.referalCode;

        // Step 2: Get referred user IDs
        const referralUsers = await ReferralUsage.find({ referralCode }, "referredUserId");
        const referredUserIds = referralUsers.map((r) => r.referredUserId).filter(Boolean);

        if (!referredUserIds.length) {
            return res.status(200).json({
                success: true,
                referralCode,
                totalCompletedSales: 0,
                totalAmount: 0,
                totalCommission: 0,
                sales: [],
            });
        }

        // Step 3: Build match stage for aggregation
        const matchStage = {
            userId: { $in: referredUserIds },
            status: "completed",
        };
        if (from && to) {
            matchStage.serviceEndTime = { $gte: new Date(from), $lte: new Date(to) };
        }

        // Step 4: Aggregate sales
        const aggregation = await Sales.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user",
                },
            },
            { $unwind: "$user" },
            {
                $lookup: {
                    from: "coupons",
                    localField: "couponId",
                    foreignField: "_id",
                    as: "coupon",
                },
            },
            { $unwind: { path: "$coupon", preserveNullAndEmptyArrays: true } },
            {
                $sort: { serviceEndTime: -1 },
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$finalAmount" },
                    sales: {
                        $push: {
                            _id: "$_id",
                            finalAmount: "$finalAmount",
                            status: "$status",
                            serviceEndTime: "$serviceEndTime",
                            user: { name: "$user.name", email: "$user.email" },
                            coupon: { code: "$coupon.code", discount: "$coupon.discount" },
                        },
                    },
                    totalCompletedSales: { $sum: 1 },
                },
            },
        ]);

        const result = aggregation[0] || { totalAmount: 0, sales: [], totalCompletedSales: 0 };

        // Step 5: Calculate referral commission
        let totalCommission = 0;
        if (user.referrelCommisationType === "fixed") {
            totalCommission = (user.referrelCommisation || 0) * result.totalCompletedSales;
        } else if (user.referrelCommisationType === "percentage") {
            totalCommission = (result.totalAmount * (user.referrelCommisation || 0)) / 100;
        }

        // Step 6: Send response
        return res.status(200).json({
            success: true,
            referralCode,
            referrer: {
                name: user.name,
                email: user.email,
            },
            totalCompletedSales: result.totalCompletedSales,
            totalAmount: result.totalAmount,
            commissionType: user.referrelCommisationType,
            totalCommission,
            sales: result.sales,
        });

    } catch (error) {
        console.error("Error fetching completed sales by referral:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
