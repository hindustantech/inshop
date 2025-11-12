import express from 'express';
import {
  getDashboardAnalytics,
  getCouponUserAnalytics,
  getCouponList,
  getSalesAnalytics,
  exportDashboardPDF
} from '../controllers/Dashboard.js';
const router = express.Router();

// Dashboard Analytics Routes
router.get('/dashboard', getDashboardAnalytics);
router.get('/coupons', getCouponList);
router.get('/user-analytics', getCouponUserAnalytics);
router.get('/sales-analytics', getSalesAnalytics);
router.get('/exportDashboardPDF', exportDashboardPDF);

export default router;