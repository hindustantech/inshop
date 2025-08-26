import express from 'express';
import {
    create,
    getall,
    deleteCoupon,
    getbyid,
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
    getCouponCount
} from '../controllers/couponController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/getall', authMiddleware, getall);
router.get('/get/:id', getbyid);
router.get('/get-cities', authMiddleware, getAllCities);

// Protected routes (authentication required)
router.get('/coupon-count', authMiddleware, getCouponCount);
router.post('/create', authMiddleware, create);
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
