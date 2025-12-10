import { CouponService } from "../services/couponService.js";
import { ValidationError } from "../utils/AppError.js";

/**
 * Middleware to validate coupon in request
 */
export const validateCouponMiddleware = async (req, res, next) => {
    try {
        const { couponCode, planId, amountINR } = req.body;

        if (!couponCode) {
            return next(); // No coupon to validate
        }

        const userId = req.user._id;
        const baseAmountPaise = planId
            ? (await mongoose.model("Plan").findById(planId)).price
            : Math.round((amountINR || 0) * 100);

        const validation = await CouponService.validateCouponOnly({
            couponCode,
            userId,
            planId,
            baseAmountPaise,
            userType: "existing_user"
        });

        if (!validation.isValid) {
            throw new ValidationError(validation.error, { code: "INVALID_COUPON" });
        }

        // Attach validation result to request for later use
        req.couponValidation = validation;
        next();
    } catch (err) {
        next(err);
    }
};