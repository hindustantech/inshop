import express from 'express';

import {
    getDashboardStats,
    getSalesAnalytics,
    getCouponsAnalytics,
    getUserCouponsAnalytics,
    exportDashboardPDF,
    getCouponsList
} from '../controllers/Dashboard.js';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

// All routes are protected
router.use(authMiddleware);

router.get('/stats', getDashboardStats);
router.get('/coupons', getCouponsList);
router.get('/export-pdf', exportDashboardPDF);
router.get('/analytics', getSalesAnalytics);

// Sales Analytics
router.get('/sales-analytics', getSalesAnalytics);

// Coupons Analytics
router.get('/coupons-analytics', getCouponsAnalytics);

export default router;