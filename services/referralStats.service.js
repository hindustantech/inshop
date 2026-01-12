// services/referralStats.service.js
import mongoose from "mongoose";
import ReferralUsage from "../models/ReferralUsage.js";

export async function getReferralStats(referrerId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const result = await ReferralUsage.aggregate([
        {
            $match: {
                referrerId: new mongoose.Types.ObjectId(referrerId),
            },
        },
        {
            $facet: {
                lifetime: [{ $count: "count" }],
                today: [
                    { $match: { createdAt: { $gte: startOfToday } } },
                    { $count: "count" },
                ],
            },
        },
        {
            $project: {
                lifetimeCount: { $ifNull: [{ $arrayElemAt: ["$lifetime.count", 0] }, 0] },
                todayCount: { $ifNull: [{ $arrayElemAt: ["$today.count", 0] }, 0] },
            },
        },
    ]);

    return result[0] || { lifetimeCount: 0, todayCount: 0 };
}
