const PERMISSION_KEYS = {
    COUPON_FREE_CREATE: "coupon_free.create",
    COUPON_PAID_CREATE: "coupon_paid.create",

    BANNER_FREE_CREATE: "banner_free.create",
    BANNER_PAID_CREATE: "banner_paid.create",
};

export function isPaymentRequired(user, { freeKey, paidKey }) {
    if (!user) return true;

    const permissions = user.permissions || [];

    // Super admin never pays
    if (user.role === "super_admin" || user.type === "super_admin") {
        return false;
    }

    // Explicit free permission
    if (permissions.includes(freeKey)) {
        return false;
    }

    // Explicit paid permission
    if (permissions.includes(paidKey)) {
        return true;
    }

    // Default secure behavior
    return true;
}