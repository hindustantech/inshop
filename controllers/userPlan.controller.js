import UserPlan from "../models/UserPlan.js";
import Plan from "../models/Plan.js";

export const getUserPlanAccess = async (req, res) => {
    try {
        const userId = req.user._id;

        // 1. Only check ACTIVE status
        const userPlan = await UserPlan.findOne({
            userId,
            status: "active",
        })
            .sort({ createdAt: -1 })
            .lean();

        if (!userPlan) {
            return res.status(200).json({
                success: true,
                data: {
                    hasActivePlan: false,
                    canCreateCoupon: false,
                    canCreateBanner: false,
                },
            });
        }

        // 2. Plan metadata (optional)
        const plan = await Plan.findById(userPlan.planId).lean();

        // 3. Access ONLY based on status
        const hasActivePlan = true;

        return res.status(200).json({
            success: true,
            data: {
                hasActivePlan,
                planType: plan?.type || null,
                tier: plan?.tier || null,

                // expiry still returned but NOT used for access
                expiresAt: userPlan.expiresAt,

                canCreateCoupon: true,
                canCreateBanner: true,
            },
        });
    } catch (error) {
        console.error("GET USER PLAN ACCESS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};