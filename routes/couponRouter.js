import express from 'express';
import CouponService from '../controllers/CouponServices.js';

const router = express.Router();

// Create a new coupon
router.post('/coupons', async (req, res) => {
    try {
        const coupon = await CouponService.createCoupon(req.body);
        res.status(201).json({
            success: true,
            data: coupon,
            message: 'Coupon created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});


router.get('/coupons', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const coupons = await CouponService.getAllCoupons({
            page: parseInt(page),
            limit: parseInt(limit),
            search
        });
        res.status(200).json({
            success: true,
            data: coupons,
            message: 'Coupons retrieved successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Claim a coupon
router.post('/coupons/:couponId/claim', async (req, res) => {
    try {
        const { userId } = req.body;
        const userCoupon = await CouponService.claimCoupon(req.params.couponId, userId);
        res.status(200).json({
            success: true,
            data: userCoupon,
            message: 'Coupon claimed successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Scan a coupon
router.post('/coupons/scan', async (req, res) => {
    try {
        const { qrCode, userId } = req.body;
        const userCoupon = await CouponService.scanCoupon(qrCode, userId);
        res.status(200).json({
            success: true,
            data: userCoupon,
            message: 'Coupon scanned successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Cancel a coupon
router.post('/coupons/:userCouponId/cancel', async (req, res) => {
    try {
        const { userId } = req.body;
        const userCoupon = await CouponService.cancelCoupon(req.params.userCouponId, userId);
        res.status(200).json({
            success: true,
            data: userCoupon,
            message: 'Coupon cancelled successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Transfer a coupon
router.post('/coupons/:userCouponId/transfer', async (req, res) => {
    try {
        const { fromUserId, toUserId } = req.body;
        const newUserCoupon = await CouponService.transferCoupon(req.params.userCouponId, fromUserId, toUserId);
        res.status(200).json({
            success: true,
            data: newUserCoupon,
            message: 'Coupon transferred successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

export default router;