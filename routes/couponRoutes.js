import express from 'express';
import {
    createCoupon,
    getAllCouponsWithStatusTag,
    getall,
    deleteCoupon,
    getById,
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
    getAllCouponsForAdmin
} from '../controllers/couponController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { roleBasedOwnership } from '../middlewares/rolebasedownership.js';
import multer from 'multer';

const router = express.Router();
const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });


router.post('/create', authMiddleware, roleBasedOwnership,upload.array("images", 5), createCoupon);

router.get('/getAllCouponsWithStatusTag', authMiddleware, getAllCouponsWithStatusTag);


router.get("/coupons/my", authMiddleware, getMyCoupons);
router.get("/coupons/admin", authMiddleware, getAllCouponsForAdmin);




// Public routes (no authentication required)
router.get('/getall', authMiddleware, getall);
router.get('/get/:id', getById);
router.get('/get-cities', authMiddleware, getAllCities);

// Protected routes (authentication required)
router.get('/coupon-count', authMiddleware, getCouponCount);
router.get('/availed', authMiddleware, getAvailedCoupon);
router.get('/store-used-coupon', authMiddleware, storeUsedCoupon);
router.delete('/delete/:id', authMiddleware, deleteCoupon);
router.put('/toggle-active/:id', authMiddleware, toggleActive);
router.put('/update/:id', authMiddleware, updateCoupon);
router.put('/avail/:id', authMiddleware, availCoupon);
router.put('/update-state/:id', authMiddleware, updateCouponState);
router.put('/update-amount/:id', authMiddleware, updateAmount);
router.put('/transfer-coupon', authMiddleware, transferCoupon);
router.put('/transfer-coupon-by-number', authMiddleware, transferCouponByPhone);

export default router;
