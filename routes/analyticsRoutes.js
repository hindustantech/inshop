import express from 'express';
import { check } from 'express-validator';
import {
    getUserAndAgencyCounts,
    getTopAgencies,
    getMonthlyCouponPerformance,
    getCouponCategoryRatios,
    getRecentActivities,
} from '../controllers/analyticsController.js';

const router = express.Router();

// Base route: /api/analytics
router.get('/counts', getUserAndAgencyCounts);

router.get('/top-agencies', [
    check('limit').optional().isInt({ min: 1, max: 20 }).toInt(), // Optional limit for top agencies
], getTopAgencies);

router.get('/coupon-performance', [
    check('startDate').optional().isISO8601().toDate(), // Optional date range
    check('endDate').optional().isISO8601().toDate(),
], getMonthlyCouponPerformance);

router.get('/coupon-categories', getCouponCategoryRatios);

router.get('/recent-activities', [
    check('page').optional().isInt({ min: 1 }).toInt(),
    check('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], getRecentActivities);

export default router;