import mongoose from "mongoose";
import shpoTopupCoupon from "../models/shpoTopupCoupon.js";
import CouponShopUsage from "../models/CouponShopUsage.js";
import { AppError, ValidationError } from "../utils/AppError.js";

export class CouponService {
    /**
     * Validate and apply coupon to a top-up
     */
    static async validateAndApplyCoupon({
        couponCode,
        userId,
        planId,
        baseAmountPaise,
        userType = "existing_user",
        session = null
    }) {
        const coupon = await shpoTopupCoupon.findByCode(couponCode);

        if (!coupon) {
            throw new ValidationError("Invalid coupon code", { code: "INVALID_COUPON" });
        }

        // Check if coupon is valid for this user
        if (!coupon.isValidForUser(userId, userType)) {
            throw new ValidationError("Coupon not valid for this user", {
                code: "COUPON_NOT_ELIGIBLE"
            });
        }

        // Check minimum purchase amount
        if (baseAmountPaise < coupon.minPurchaseAmount) {
            throw new ValidationError(`Minimum purchase amount is ${coupon.minPurchaseAmount / 100}`, {
                code: "MIN_AMOUNT_REQUIRED",
                minAmount: coupon.minPurchaseAmount
            });
        }

        // Check per user usage limit
        if (coupon.perUserLimit > 0) {
            const userUsageCount = await CouponShopUsage.countDocuments({
                couponId: coupon._id,
                userId,
                status: { $in: ["redeemed", "applied"] }
            }).session(session);

            if (userUsageCount >= coupon.perUserLimit) {
                throw new ValidationError("Coupon usage limit reached for this user", {
                    code: "USER_LIMIT_REACHED"
                });
            }
        }

        // Calculate discount
        const calculation = coupon.calculateDiscount(baseAmountPaise, planId);

        if (!calculation.isValid) {
            throw new ValidationError("Coupon not applicable to this plan", {
                code: "PLAN_NOT_ELIGIBLE"
            });
        }

        // Create coupon usage record
        const couponUsage = await CouponShopUsage.create([{
            couponId: coupon._id,
            userId,
            planId,
            amountBeforeDiscount: baseAmountPaise,
            discountApplied: calculation.discountAmount,
            bonusCredit: calculation.bonusCredit,
            finalAmountPaid: calculation.finalAmount,
            finalCreditReceived: calculation.finalCredit,
            couponCode: coupon.code,
            couponDiscountType: coupon.discountType,
            couponDiscountValue: coupon.discountValue,
            status: "applied",
            metadata: { validatedAt: new Date() }
        }], { session });

        return {
            coupon,
            couponUsage: couponUsage[0],
            calculation,
            isValid: true
        };
    }

    /**
     * Mark coupon as redeemed after successful payment
     */
    static async markCouponAsRedeemed({
        couponUsageId,
        topUpAttemptId,
        session = null
    }) {
        const couponUsage = await CouponShopUsage.findById(couponUsageId).session(session);

        if (!couponUsage) {
            throw new ValidationError("Coupon usage record not found");
        }

        if (couponUsage.status === "redeemed") {
            return couponUsage; // Already redeemed
        }

        couponUsage.status = "redeemed";
        couponUsage.topUpAttemptId = topUpAttemptId;
        await couponUsage.save({ session });

        // Increment coupon usage count
        await Coupon.findByIdAndUpdate(
            couponUsage.couponId,
            { $inc: { usedCount: 1 } },
            { session }
        );

        return couponUsage;
    }

    /**
     * Get user's available coupons
     */
    static async getUserAvailableCoupons(userId, userType = "existing_user") {
        const now = new Date();

        const coupons = await shpoTopupCoupon.find({
            isActive: true,
            isDeleted: false,
            validFrom: { $lte: now },
            validTill: { $gte: now },
            $or: [
                { eligibleUserTypes: "all" },
                { eligibleUserTypes: userType },
                { specificUsers: userId }
            ]
        }).sort({ validTill: 1 });

        // Filter by user usage limit
        const availableCoupons = [];

        for (const coupon of coupons) {
            if (coupon.perUserLimit > 0) {
                const userUsageCount = await CouponShopUsage.countDocuments({
                    couponId: coupon._id,
                    userId,
                    status: { $in: ["redeemed", "applied"] }
                });

                if (userUsageCount >= coupon.perUserLimit) {
                    continue;
                }
            }

            availableCoupons.push(coupon);
        }

        return availableCoupons;
    }

    /**
     * Get coupon usage history for user
     */
    static async getUserCouponHistory(userId, limit = 20, page = 1) {
        const skip = (page - 1) * limit;

        const history = await CouponShopUsage.find({ userId })
            .populate("couponId", "code title discountType discountValue")
            .populate("planId", "name")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await CouponShopUsage.countDocuments({ userId });

        return {
            history,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Validate coupon without applying it
     */
    static async validateCouponOnly({
        couponCode,
        userId,
        planId,
        baseAmountPaise,
        userType = "existing_user"
    }) {
        const coupon = await shpoTopupCoupon.findByCode(couponCode);

        if (!coupon) {
            return { isValid: false, error: "Invalid coupon code" };
        }

        if (!coupon.isValidForUser(userId, userType)) {
            return { isValid: false, error: "Coupon not valid for this user" };
        }

        if (baseAmountPaise < coupon.minPurchaseAmount) {
            return {
                isValid: false,
                error: `Minimum purchase amount is ${coupon.minPurchaseAmount / 100}`
            };
        }

        const calculation = coupon.calculateDiscount(baseAmountPaise, planId);

        if (!calculation.isValid) {
            return { isValid: false, error: "Coupon not applicable to this plan" };
        }

        return {
            isValid: true,
            coupon: {
                code: coupon.code,
                title: coupon.title,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue
            },
            calculation
        };
    }
}