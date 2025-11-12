import express from 'express';
import {
  getDashboardAnalytics,
  getCouponUserAnalytics,
  getCouponList,
  getSalesAnalytics,

} from '../controllers/Dashboard.js';
import { exportDashboardPDF } from '../controllers/exportdashboard.js';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();
router.use(authMiddleware);
// Dashboard Analytics Routes
router.get('/dashboard', getDashboardAnalytics);
router.get('/coupons', getCouponList);
router.get('/user-analytics', getCouponUserAnalytics);
router.get('/sales-analytics', getSalesAnalytics);
router.get('/exportDashboardPDF', exportDashboardPDF);

export default router;