import UserPlan from "../models/UserPlan.js";
import Plan from "../models/Plan.js";




export const getUserPlanAccess = async (req, res) => {
    try {
        const userId = req.user._id;

        // 1. Get active plan (latest one)
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

        // 2. Get plan details
        const plan = await Plan.findById(userPlan.planId).lean();

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
            });
        }

        // 3. Expiry check
        const now = new Date();
        const isExpired =
            userPlan.expiresAt && new Date(userPlan.expiresAt) < now;

        // Auto-expire (lazy update pattern)
        if (isExpired && userPlan.status !== "expired") {
            await UserPlan.updateOne(
                { _id: userPlan._id },
                { status: "expired" }
            );
        }

        // 4. Coupons calculation
        const couponsRemaining =
            (userPlan.couponsAllowed || 0) -
            (userPlan.couponsUsed || 0);

        // 5. Access rules
        const canCreateCoupon =
            !isExpired &&
            plan.type === "coupon" &&
            couponsRemaining > 0;

        const canCreateBanner =
            !isExpired &&
            plan.type === "banner";

        // 6. Response
        return res.status(200).json({
            success: true,
            data: {
                hasActivePlan: !isExpired,
                planType: plan.type,
                tier: plan.tier,
                expiresAt: userPlan.expiresAt,
                isExpired,

                couponsAllowed: userPlan.couponsAllowed,
                couponsUsed: userPlan.couponsUsed,
                couponsRemaining,

                canCreateCoupon,
                canCreateBanner,
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