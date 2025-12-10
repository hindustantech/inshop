export const COUPON_ERRORS = {
  INVALID_COUPON: {
    code: 'INVALID_COUPON',
    message: 'Invalid coupon code'
  },
  COUPON_EXPIRED: {
    code: 'COUPON_EXPIRED',
    message: 'This coupon has expired'
  },
  MIN_AMOUNT_REQUIRED: {
    code: 'MIN_AMOUNT_REQUIRED',
    message: 'Minimum purchase amount not met'
  },
  USER_LIMIT_REACHED: {
    code: 'USER_LIMIT_REACHED',
    message: 'Coupon usage limit reached for this user'
  },
  GLOBAL_LIMIT_REACHED: {
    code: 'GLOBAL_LIMIT_REACHED',
    message: 'Coupon usage limit reached'
  },
  PLAN_NOT_ELIGIBLE: {
    code: 'PLAN_NOT_ELIGIBLE',
    message: 'Coupon not applicable to this plan'
  },
  USER_NOT_ELIGIBLE: {
    code: 'USER_NOT_ELIGIBLE',
    message: 'Coupon not valid for this user type'
  },
  COUPON_INACTIVE: {
    code: 'COUPON_INACTIVE',
    message: 'This coupon is no longer active'
  }
};

export class CouponError extends Error {
  constructor(errorType, extra = {}) {
    super(errorType.message);
    this.name = 'CouponError';
    this.code = errorType.code;
    this.statusCode = 400;
    this.extra = extra;
  }
}