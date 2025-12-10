import { CouponService } from "../services/couponService.js";
import { AppError, ValidationError } from "../utils/AppError.js";

export class CouponController {
    /**
     * Validate a coupon for a top-up
     */
    static async validateCoupon(req, res, next) {
        try {
            const userId = req.user._id;
            const { couponCode, planId, amountINR } = req.body;

            if (!couponCode) {
                throw new ValidationError("Coupon code is required");
            }

            const baseAmountPaise = planId
                ? (await mongoose.model("Plan").findById(planId)).price
                : Math.round(amountINR * 100);

            const validation = await CouponService.validateCouponOnly({
                couponCode,
                userId,
                planId,
                baseAmountPaise,
                userType: "existing_user" // Determine from user data
            });

            if (!validation.isValid) {
                throw new ValidationError(validation.error, { code: "INVALID_COUPON" });
            }

            return res.json({
                success: true,
                data: {
                    isValid: true,
                    coupon: validation.coupon,
                    calculation: {
                        baseAmount: baseAmountPaise / 100,
                        discountAmount: validation.calculation.discountAmount / 100,
                        bonusCredit: validation.calculation.bonusCredit / 100,
                        finalAmount: validation.calculation.finalAmount / 100,
                        finalCredit: validation.calculation.finalCredit / 100
                    }
                }
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Get user's available coupons
     */
    static async getAvailableCoupons(req, res, next) {
        try {
            const userId = req.user._id;
            const coupons = await CouponService.getUserAvailableCoupons(userId, "existing_user");

            return res.json({
                success: true,
                data: coupons.map(coupon => ({
                    code: coupon.code,
                    title: coupon.title,
                    description: coupon.description,
                    discountType: coupon.discountType,
                    discountValue: coupon.discountValue,
                    minPurchaseAmount: coupon.minPurchaseAmount / 100,
                    validTill: coupon.validTill,
                    applicablePlans: coupon.applicablePlans,
                    terms: {
                        perUserLimit: coupon.perUserLimit,
                        usageLimit: coupon.usageLimit,
                        usedCount: coupon.usedCount
                    }
                }))
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Get coupon usage history
     */
    static async getCouponHistory(req, res, next) {
        try {
            const userId = req.user._id;
            const { limit = 20, page = 1 } = req.query;

            const history = await CouponService.getUserCouponHistory(
                userId,
                parseInt(limit),
                parseInt(page)
            );

            return res.json({
                success: true,
                data: {
                    history: history.history.map(usage => ({
                        couponCode: usage.couponCode,
                        status: usage.status,
                        amountBeforeDiscount: usage.amountBeforeDiscount / 100,
                        discountApplied: usage.discountApplied / 100,
                        bonusCredit: usage.bonusCredit / 100,
                        finalAmountPaid: usage.finalAmountPaid / 100,
                        finalCreditReceived: usage.finalCreditReceived / 100,
                        appliedAt: usage.createdAt,
                        redeemedAt: usage.updatedAt
                    })),
                    pagination: history.pagination
                }
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Apply coupon to cart/order
     */
    static async applyCoupon(req, res, next) {
        try {
            const userId = req.user._id;
            const { couponCode, planId, amountINR } = req.body;

            if (!couponCode) {
                throw new ValidationError("Coupon code is required");
            }

            const baseAmountPaise = planId
                ? (await mongoose.model("Plan").findById(planId)).price
                : Math.round(amountINR * 100);

            const result = await CouponService.validateAndApplyCoupon({
                couponCode,
                userId,
                planId,
                baseAmountPaise,
                userType: "existing_user"
            });

            return res.json({
                success: true,
                data: {
                    couponApplied: true,
                    couponCode: result.coupon.code,
                    couponUsageId: result.couponUsage._id,
                    calculation: {
                        baseAmount: baseAmountPaise / 100,
                        discountAmount: result.calculation.discountAmount / 100,
                        bonusCredit: result.calculation.bonusCredit / 100,
                        finalAmount: result.calculation.finalAmount / 100,
                        finalCredit: result.calculation.finalCredit / 100
                    },
                    validTill: result.coupon.validTill
                }
            });
        } catch (err) {
            next(err);
        }
    }
}

export default CouponController;