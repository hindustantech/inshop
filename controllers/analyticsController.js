import { validationResult } from 'express-validator';

import User from '../models/userModel.js';
import Category from '../models/CategoryCopun.js';
import Banner from '../models/Banner.js';
import UserCoupon from '../models/UserCoupon.js';
import Coupon from '../models/coupunModel.js';
import logger from '../utils/logger.js';
// Helper to format error responses
const sendError = (res, status, message, error = null) => {
  logger.error(`${message}: ${error?.message || 'No error details'}`);
  return res.status(status).json({ status: 'error', message, error: error?.message });
};

// Helper to format success responses
const sendSuccess = (res, data, message = 'Request successful') => {
  return res.status(200).json({ status: 'success', message, data });
};

// 1. Get Total Users and Total Agencies
export const getUserAndAgencyCounts = async (req, res) => {
  try {
    logger.info('Fetching user and agency counts');
    const totalUsers = await User.countDocuments({ type: 'user' });
    const totalAgencies = await User.countDocuments({ type: 'agency' });

    const data = {
      totalUsers,
      totalAgencies,
      timestamp: new Date().toISOString(),
    };

    return sendSuccess(res, data, 'User and agency counts retrieved successfully');
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch user and agency counts', error);
  }
};

// 2. Get Top Agencies (Based on Coupons and Banners Created) - Line Graph Data
export const getTopAgencies = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', errors.array());
    }

    const limit = req.query.limit || 10; // Default to 10
    logger.info(`Fetching top ${limit} agencies`);

    const topAgencies = await User.aggregate([
      { $match: { type: 'agency' } },
      {
        $lookup: {
          from: 'banners',
          localField: '_id',
          foreignField: 'createdby',
          as: 'banners',
        },
      },
      {
        $project: {
          name: 1,
          couponsCreated: { $size: '$createdCouponsId' },
          bannersCreated: { $size: '$banners' },
          totalCreations: {
            $add: [{ $size: '$createdCouponsId' }, { $size: '$banners' }],
          },
        },
      },
      { $sort: { totalCreations: -1 } },
      { $limit: parseInt(limit) },
    ]);

    // Format for Chart.js line graph
    const chartData = {
      labels: topAgencies.map(agency => agency.name || 'Unnamed Agency'),
      datasets: [
        {
          label: 'Total Creations (Coupons + Banners)',
          data: topAgencies.map(agency => agency.totalCreations),
          borderColor: '#4A90E2',
          backgroundColor: 'rgba(74, 144, 226, 0.2)',
          fill: true,
          tension: 0.4, // Smooth line
        },
      ],
    };

    const data = {
      topAgencies,
      chartData,
      timestamp: new Date().toISOString(),
    };

    return sendSuccess(res, data, `Top ${limit} agencies retrieved successfully`);
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch top agencies', error);
  }
};

// 3. Get Coupon Uses and Creations Monthly Wise - Line Graph Data
export const getMonthlyCouponPerformance = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', errors.array());
    }

    const { startDate, endDate } = req.query;
    const match = {};
    if (startDate && endDate) {
      match.useDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    logger.info(`Fetching coupon performance${startDate && endDate ? ` from ${startDate} to ${endDate}` : ''}`);

    // Monthly coupon uses
    const monthlyUses = await UserCoupon.aggregate([
      { $match: { status: 'used', ...match } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$useDate' } },
          usedCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Monthly coupon creations
    const creationMatch = startDate && endDate ? { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } : {};
    const monthlyCreations = await Coupon.aggregate([
      { $match: creationMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          createdCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Merge months for consistent x-axis
    const months = [...new Set([
      ...monthlyUses.map(u => u._id),
      ...monthlyCreations.map(c => c._id),
    ])].sort();

    // Prepare Chart.js data
    const useData = months.map(m => monthlyUses.find(u => u._id === m)?.usedCount || 0);
    const createData = months.map(m => monthlyCreations.find(c => c._id === m)?.createdCount || 0);

    const chartData = {
      labels: months,
      datasets: [
        {
          label: 'Coupons Used',
          data: useData,
          borderColor: '#2ECC71',
          backgroundColor: 'rgba(46, 204, 113, 0.2)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Coupons Created',
          data: createData,
          borderColor: '#E74C3C',
          backgroundColor: 'rgba(231, 76, 60, 0.2)',
          fill: true,
          tension: 0.4,
        },
      ],
    };

    const data = {
      monthlyUses,
      monthlyCreations,
      performanceRatios: months.map((m, i) => ({
        month: m,
        ratio: createData[i] ? (useData[i] / createData[i] * 100).toFixed(2) + '%' : 'N/A',
      })),
      chartData,
      timestamp: new Date().toISOString(),
    };

    return sendSuccess(res, data, 'Coupon performance retrieved successfully');
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch coupon performance', error);
  }
};

// 4. Get Coupon Ratio by Category - Pie Chart Data
export const getCouponCategoryRatios = async (req, res) => {
  try {
    logger.info('Fetching coupon category ratios');

    const categoryRatios = await Coupon.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'cat',
        },
      },
      {
        $project: {
          categoryName: { $arrayElemAt: ['$cat.name', 0] },
          count: 1,
        },
      },
    ]);

    // Format for Chart.js pie chart
    const chartData = {
      labels: categoryRatios.map(r => r.categoryName || 'Unknown'),
      datasets: [
        {
          data: categoryRatios.map(r => r.count),
          backgroundColor: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#C9CB3F', '#7F8C8D', '#E67E22', '#2ECC71',
          ],
          hoverOffset: 20,
        },
      ],
    };

    const data = {
      categoryRatios,
      chartData,
      totalCoupons: categoryRatios.reduce((sum, r) => sum + r.count, 0),
      timestamp: new Date().toISOString(),
    };

    return sendSuccess(res, data, 'Coupon category ratios retrieved successfully');
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch coupon category ratios', error);
  }
};

// 5. Get Recent Activities (Last 20 by default, paginated)
export const getRecentActivities = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 400, 'Validation failed', errors.array());
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    logger.info(`Fetching recent activities (page: ${page}, limit: ${limit})`);

    // Fetch activities with lean for performance
    const recentUsers = await User.find()
      .select('name type createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .then(users => users.map(u => ({
        type: 'user_registered',
        data: { name: u.name, type: u.type },
        timestamp: u.createdAt,
      })));

    const recentBanners = await Banner.find()
      .select('title createdby createdAt')
      .populate('createdby', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .then(banners => banners.map(b => ({
        type: 'banner_created',
        data: { title: b.title, createdBy: b.createdby?.name || 'Unknown' },
        timestamp: b.createdAt,
      })));

    const recentCoupons = await Coupon.find()
      .select('title createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .then(coupons => coupons.map(c => ({
        type: 'coupon_created',
        data: { title: c.title },
        timestamp: c.createdAt,
      })));

    const recentTransferred = await UserCoupon.find({ status: 'transferred' })
      .select('couponId userId transferDate')
      .populate('couponId', 'title')
      .populate('userId', 'name')
      .sort({ transferDate: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .then(transfers => transfers.map(t => ({
        type: 'coupon_transferred',
        data: { couponTitle: t.couponId?.title || 'Unknown', user: t.userId?.name || 'Unknown' },
        timestamp: t.transferDate,
      })));

    const recentUsed = await UserCoupon.find({ status: 'used' })
      .select('couponId userId useDate')
      .populate('couponId', 'title')
      .populate('userId', 'name')
      .sort({ useDate: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .then(used => used.map(u => ({
        type: 'coupon_used',
        data: { couponTitle: u.couponId?.title || 'Unknown', user: u.userId?.name || 'Unknown' },
        timestamp: u.useDate,
      })));

    // Combine and sort activities
    const activities = [
      ...recentUsers,
      ...recentBanners,
      ...recentCoupons,
      ...recentTransferred,
      ...recentUsed,
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit); // Ensure we respect the limit

    const data = {
      activities,
      pagination: {
        page,
        limit,
        total: activities.length, // Note: This is the count of returned items; for total count, you'd need separate queries
      },
      timestamp: new Date().toISOString(),
    };

    return sendSuccess(res, data, 'Recent activities retrieved successfully');
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch recent activities', error);
  }
};