// services/subscription.service.js

import BuyPlan from "../models/buyPlan.js";

/**
 * Verify if user has completed first payment (active plan)
 * @param {String} userId
 * @returns {Object} { success, plan, message }
 */
export const verifyUserFirstPayment = async (userId) => {
    try {
        if (!userId) {
            return {
                success: false,
                message: "User ID is required"
            };
        }

        // 🔥 Find active + valid plan
        const plan = await BuyPlan.findOne({
            userId,
            status: "complete",
            active: true,
            expiryDate: { $gt: new Date() }
        })
            .populate("planId")
            .lean();

        if (!plan) {
            return {
                success: false,
                message: "No active plan found. Please complete your first payment."
            };
        }

        return {
            success: true,
            plan
        };
    } catch (error) {
        console.error("verifyUserFirstPayment error:", error);
        return {
            success: false,
            message: "Error verifying payment"
        };
    }
};



/**
 * Force mark plan as consumed (no checks)
 * @param {String} userId
 */
export const forceConsumeUserPlan = async (userId) => {
    try {
        const updatedPlan = await BuyPlan.findOneAndUpdate(
            { userId, active: true },
            {
                $set: {
                    status: "consumed",
                    active: false,
                    consumedAt: new Date()
                }
            },
            { new: true }
        );

        return {
            success: true,
            plan: updatedPlan
        };
    } catch (error) {
        console.error("forceConsumeUserPlan error:", error);
        return {
            success: false,
            message: "Failed to update plan"
        };
    }
};