import express from 'express';

import {
    getDashboardStats,
    getCouponsList,
    exportDashboardPDF,
    getSalesAnalytics
} from '../controllers/Dashboard.js';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

// All routes are protected
router.use(authMiddleware);

router.get('/stats', getDashboardStats);
router.get('/coupons', getCouponsList);
router.get('/export-pdf', exportDashboardPDF);
router.get('/analytics', getSalesAnalytics);

export default router;