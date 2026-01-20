import express from 'express';
import {
    generateTheQRCode,
    createCoupon,
    getAllCouponsWithStatusTag,
    getall,
    deleteCoupon,
    getById,
    getOwnerDraftExpiredCoupon,
    toggleActive,
    updateCoupon,
    availCoupon,
    updateCouponState,
    getAvailedCoupon,
    updateAmount,
    storeUsedCoupon,
    transferCoupon,
    transferCouponByPhone,
    getAllCities,
    getCouponCount,
    getMyCoupons,
    getAllCouponsForAdmin,
    claimCoupon,
    getAvailableCouponsWithDetails,
    getOwnerCouponDetails,
    getOwnerCoupons,
    updateCouponDeatils,
    updateCouponByAdmin,
    createCouponAdmin,
    updateCouponFromAdmin,
    updateGiftHamperAdmin,
    ownerApproveCoupon,
    ownerRevokeCoupon,
    getAllGiftWithStatusTag,
    createGiftHamperAdmin,
    getAllGiftForAdmin,
    getGiftById,
} from '../controllers/couponController.js';
import { checkPermission } from '../middlewares/checkPermission.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { authMiddleware1, isSuperAdmin } from '../middlewares/checkuser.js';
import { roleBasedOwnership } from '../middlewares/rolebasedownership.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });

router.put('/updateCouponDeatils/:couponId', authMiddleware, updateCouponDeatils);

router.put(
    "/admin/coupons/:couponId",
    authMiddleware,
    checkPermission('coupon.update'), // check login
    isSuperAdmin,          // check role is admin
    updateCouponByAdmin
)

router.post(
    '/create',
    authMiddleware,
    upload.array("images", 5),
    roleBasedOwnership,
    createCoupon
);

router.post(
    '/createCouponAdmin',
    authMiddleware,
    checkPermission('coupon.create'),
    upload.array("images", 5),
    roleBasedOwnership,
    createCouponAdmin
);
router.post(
    '/createGiftHamperAdmin',
    authMiddleware,
    checkPermission('coupon.create'),
    upload.array("images", 5),
    roleBasedOwnership,
    createGiftHamperAdmin
);

router.put(
    '/updateCouponFromAdmin/:id',
    authMiddleware,
    upload.array('images', 10),
    updateCouponFromAdmin
);
router.put(
    '/updateGiftHamperAdmin/:id',
    authMiddleware,
    upload.array('images', 10),
    updateGiftHamperAdmin
);

router.get('/getAllCouponsWithStatusTag', authMiddleware1, getAllCouponsWithStatusTag);
router.get('/getAllGiftWithStatusTag', authMiddleware1, getAllGiftWithStatusTag);


router.get("/coupons/my", authMiddleware, getMyCoupons);
// router.get("/coupons/admin", authMiddleware, getAllCouponsForAdmin);
router.get("/coupons/admin", authMiddleware, checkPermission('coupon.list'), getAllCouponsForAdmin);
router.get("/generateTheQRCode", authMiddleware, generateTheQRCode);

router.post("/claimCoupon", authMiddleware, claimCoupon);
router.get("/getAvailableCouponsWithDetails/:userId", getAvailableCouponsWithDetails);

// @route   GET /api/coupons/owner/:ownerId
// @desc    Get all coupons for a specific owner
// @access  Private
router.get('/owner/:ownerId', authMiddleware, getOwnerCoupons);

// @route   GET /api/coupons/:couponId/owner/:ownerId
// @desc    Get detailed information for a specific coupon owned by an owner
// @access  Private
router.get('/:couponId/owner/:ownerId', authMiddleware, getOwnerCouponDetails);


// Public routes (no authentication required)
router.get('/getall', authMiddleware, getall);
router.get('/get/:id', authMiddleware, getById);

router.get('/getAllGiftForAdmin', authMiddleware, getAllGiftForAdmin);
router.get('/getGiftById/:id', authMiddleware, getGiftById);
router.get('/getOwnerDraftExpiredCoupon/:id', authMiddleware, getOwnerDraftExpiredCoupon);
router.get('/get-cities', authMiddleware, getAllCities);

// Protected routes (authentication required)
router.get('/coupon-count', authMiddleware, getCouponCount);
router.get('/availed', authMiddleware, getAvailedCoupon);
router.get('/store-used-coupon', authMiddleware, storeUsedCoupon);
router.delete(
    '/delete/:id',
    authMiddleware,
    checkPermission('coupon.delete'),
    deleteCoupon
);
router.put('/toggle-active/:id', authMiddleware, toggleActive);
router.put('/update/:id', authMiddleware, updateCoupon);
router.put('/avail/:id', authMiddleware, availCoupon);
router.put('/update-state/:id', authMiddleware, updateCouponState);
router.put('/update-amount/:id', authMiddleware, updateAmount);
router.put('/transfer-coupon', authMiddleware, transferCoupon);
router.put('/transfer-coupon-by-number', authMiddleware, transferCouponByPhone);
router.patch('/ownerApproveCoupon/:couponId', authMiddleware, ownerApproveCoupon);
router.patch('/ownerRevokeCoupon/:couponId', authMiddleware, ownerRevokeCoupon);

export default router;
