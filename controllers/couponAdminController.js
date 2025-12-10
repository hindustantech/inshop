import mongoose from "mongoose";
import Coupon from "../../models/Coupon.js";
import CouponShopUsage from "../../models/CouponShopUsage.js";
import { AppError, ValidationError } from "../../utils/AppError.js";

export class CouponAdminController {
    /**
     * Create a new coupon
     */
    static async createCoupon(req, res, next) {
        try {
            const {
                code,
                title,
                description,
                discountType,
                discountValue,
                minPurchaseAmount,
                maxDiscountAmount,
                bonusAmount,
                validFrom,
                validTill,
                usageLimit,
                perUserLimit,
                applicablePlans,
                eligibleUserTypes,
                specificUsers,
                campaignName,
                tags
            } = req.body;

            // Check if coupon code already exists
            const existing = await Coupon.findOne({ code: code.toUpperCase() });
            if (existing) {
                throw new ValidationError("Coupon code already exists");
            }

            const coupon = await Coupon.create({
                code: code.toUpperCase(),
                title,
                description,
                discountType,
                discountValue,
                minPurchaseAmount: minPurchaseAmount ? minPurchaseAmount * 100 : 0,
                maxDiscountAmount: maxDiscountAmount ? maxDiscountAmount * 100 : 0,
                bonusAmount: bonusAmount ? bonusAmount * 100 : 0,
                validFrom: validFrom ? new Date(validFrom) : new Date(),
                validTill: new Date(validTill),
                usageLimit,
                perUserLimit,
                applicablePlans,
                eligibleUserTypes: eligibleUserTypes || ["all"],
                specificUsers,
                campaignName,
                tags,
                createdBy: req.user._id,
                updatedBy: req.user._id
            });

            return res.json({
                success: true,
                data: coupon
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Get all coupons with filters
     */
    static async getAllCoupons(req, res, next) {
        try {
            const {
                status = 'active',
                page = 1,
                limit = 20,
                campaign,
                search
            } = req.query;

            const query = {};

            if (status === 'active') {
                query.isActive = true;
                query.isDeleted = false;
            } else if (status === 'inactive') {
                query.isActive = false;
            } else if (status === 'deleted') {
                query.isDeleted = true;
            }

            if (campaign) {
                query.campaignName = campaign;
            }

            if (search) {
                query.$or = [
                    { code: { $regex: search, $options: 'i' } },
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            const skip = (page - 1) * limit;

            const [coupons, total] = await Promise.all([
                Coupon.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .lean(),
                Coupon.countDocuments(query)
            ]);

            return res.json({
                success: true,
                data: coupons,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Get coupon analytics
     */
    static async getCouponAnalytics(req, res, next) {
        try {
            const { couponId } = req.params;

            const [coupon, usageStats] = await Promise.all([
                Coupon.findById(couponId).lean(),
                CouponShopUsage.aggregate([
                    { $match: { couponId: mongoose.Types.ObjectId(couponId) } },
                    {
                        $group: {
                            _id: "$status",
                            count: { $sum: 1 },
                            totalDiscount: { $sum: "$discountApplied" },
                            totalBonus: { $sum: "$bonusCredit" }
                        }
                    }
                ])
            ]);

            const totalUsage = usageStats.reduce((sum, stat) => sum + stat.count, 0);
            const redeemed = usageStats.find(stat => stat._id === 'redeemed') || { count: 0 };
            const applied = usageStats.find(stat => stat._id === 'applied') || { count: 0 };

            // Get daily usage for last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const dailyUsage = await CouponShopUsage.aggregate([
                {
                    $match: {
                        couponId: mongoose.Types.ObjectId(couponId),
                        createdAt: { $gte: thirtyDaysAgo }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                        },
                        count: { $sum: 1 },
                        redeemed: {
                            $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] }
                        }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            return res.json({
                success: true,
                data: {
                    coupon,
                    analytics: {
                        totalUsage,
                        redeemed: redeemed.count,
                        applied: applied.count,
                        conversionRate: totalUsage > 0 ? (redeemed.count / totalUsage) * 100 : 0,
                        totalDiscountGiven: (usageStats.reduce((sum, stat) => sum + (stat.totalDiscount || 0), 0)) / 100,
                        totalBonusGiven: (usageStats.reduce((sum, stat) => sum + (stat.totalBonus || 0), 0)) / 100,
                        dailyUsage
                    }
                }
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Update coupon
     */
    static async updateCoupon(req, res, next) {
        try {
            const { couponId } = req.params;
            const updates = req.body;

            // Convert amount fields to paise if present
            if (updates.minPurchaseAmount) {
                updates.minPurchaseAmount = updates.minPurchaseAmount * 100;
            }
            if (updates.maxDiscountAmount) {
                updates.maxDiscountAmount = updates.maxDiscountAmount * 100;
            }
            if (updates.bonusAmount) {
                updates.bonusAmount = updates.bonusAmount * 100;
            }

            if (updates.code) {
                updates.code = updates.code.toUpperCase();
            }

            updates.updatedBy = req.user._id;

            const coupon = await Coupon.findByIdAndUpdate(
                couponId,
                { $set: updates },
                { new: true, runValidators: true }
            );

            if (!coupon) {
                throw new ValidationError("Coupon not found");
            }

            return res.json({
                success: true,
                data: coupon
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Delete/disable coupon
     */
    static async deleteCoupon(req, res, next) {
        try {
            const { couponId } = req.params;
            const { hardDelete = false } = req.query;

            if (hardDelete) {
                await Coupon.findByIdAndDelete(couponId);
            } else {
                await Coupon.findByIdAndUpdate(couponId, {
                    isActive: false,
                    isDeleted: true,
                    updatedBy: req.user._id
                });
            }

            return res.json({
                success: true,
                message: `Coupon ${hardDelete ? 'permanently deleted' : 'disabled'} successfully`
            });
        } catch (err) {
            next(err);
        }
    }
}

export default CouponAdminController;