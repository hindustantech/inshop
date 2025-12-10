/**
 * Format coupon for display
 */
export function formatCouponForDisplay(coupon) {
    return {
        code: coupon.code,
        title: coupon.title,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: coupon.minPurchaseAmount / 100,
        validTill: coupon.validTill,
        terms: {
            perUserLimit: coupon.perUserLimit,
            usageLimit: coupon.usageLimit,
            usedCount: coupon.usedCount
        }
    };
}

/**
 * Generate coupon code
 */
export function generateCouponCode(length = 8, prefix = 'SHOP') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters
    let code = prefix;

    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return code;
}

/**
 * Calculate savings for display
 */
export function calculateSavings(baseAmount, finalAmount, bonusCredit) {
    const discount = baseAmount - finalAmount;
    const totalValue = finalAmount + bonusCredit;
    const savingsPercentage = ((discount + bonusCredit) / baseAmount) * 100;

    return {
        discountAmount: discount,
        bonusCredit: bonusCredit,
        totalSavings: discount + bonusCredit,
        savingsPercentage: savingsPercentage.toFixed(1),
        valueForMoney: (totalValue / finalAmount).toFixed(2)
    };
}

/**
 * Validate coupon expiration
 */
export function isCouponExpired(validTill) {
    return new Date() > new Date(validTill);
}

/**
 * Check if user can use coupon
 */
export async function canUserUseCoupon(userId, couponId, session = null) {
    const coupon = await Coupon.findById(couponId).session(session);

    if (!coupon) return false;
    if (!coupon.isValidForUser(userId)) return false;

    if (coupon.perUserLimit > 0) {
        const usageCount = await CouponShopUsage.countDocuments({
            couponId,
            userId,
            status: { $in: ["redeemed", "applied"] }
        }).session(session);

        if (usageCount >= coupon.perUserLimit) return false;
    }

    return true;
}