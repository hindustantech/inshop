import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
import UserCoupon from "../models/UserCoupon.js";
import PatnerProfile from "../models/PatnerProfile.js";
import PDFDocument from 'pdfkit';
import mongoose from "mongoose";

// ==============================
// HELPER FUNCTIONS
// ==============================

/**
 * Build date filter for MongoDB queries
 */
const buildDateFilter = (fromDate, toDate) => {
    const filter = {};

    if (fromDate && toDate) {
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);

        filter.createdAt = {
            $gte: startDate,
            $lte: endDate
        };
    } else if (fromDate) {
        filter.createdAt = { $gte: new Date(fromDate) };
    } else if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt = { $lte: endDate };
    }

    return filter;
};

/**
 * Build period filter for date ranges
 */
const buildPeriodFilter = (period) => {
    if (!period) return {};

    const startDate = new Date();
    const endDate = new Date();

    switch (period) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'yesterday':
            startDate.setDate(startDate.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(endDate.getDate() - 1);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
        case 'month':
            startDate.setMonth(startDate.getMonth() - 1);
            break;
        case 'year':
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        default:
            return {};
    }

    return {
        createdAt: {
            $gte: startDate,
            $lte: endDate
        }
    };
};

/**
 * Format currency values
 */
const formatCurrency = (amount) => parseFloat(amount?.toFixed(2) || 0);

/**
 * Calculate redeem rate
 */
const calculateRedeemRate = (used, total) => total > 0 ? (used / total) * 100 : 0;

/**
 * Calculate coupon status
 */
const getCouponStatus = (validTill, currentDistributions, maxDistributions) => {
    const isExpired = new Date(validTill) < new Date();
    const isFullyRedeemed = currentDistributions >= maxDistributions;

    if (isExpired) return "Expired";
    if (isFullyRedeemed) return "Fully Redeemed";
    if (currentDistributions > 0) return "Partially Redeemed";
    return "Active";
};

// ==============================
// DASHBOARD STATISTICS CONTROLLER - FIXED WITH ACCURATE FLOW
// ==============================

export const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;

        // Get partner profile
        const partnerProfile = await PatnerProfile.findOne({ User_id: userId });

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

        // Execute parallel queries for better performance
        const [couponStats, salesStats, userCouponStats] = await Promise.all([
            // Coupon statistics
            Coupon.aggregate([
                {
                    $match: {
                        ownerId: new mongoose.Types.ObjectId(userId),
                        ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {})
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalMaxDistributions: { $sum: "$maxDistributions" },
                        totalCurrentDistributions: { $sum: "$currentDistributions" },
                        avgDiscountPercentage: { $avg: { $toDouble: "$discountPercentage" } },
                        totalCoupons: { $sum: 1 }
                    }
                }
            ]),

            // Sales statistics - get sales for coupons owned by this partner
            Sales.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo"
                    }
                },
                {
                    $unwind: "$couponInfo"
                },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "completed",
                        ...dateFilter
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" },
                        totalSales: { $sum: 1 },
                        totalFinalAmount: { $sum: "$finalAmount" }
                    }
                }
            ]),

            // User coupon statistics - get used coupons count
            UserCoupon.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo"
                    }
                },
                {
                    $unwind: "$couponInfo"
                },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "used",
                        ...dateFilter
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalUsedCoupons: { $sum: 1 }
                    }
                }
            ])
        ]);

        // Extract values with fallbacks
        const totalAmount = formatCurrency(salesStats[0]?.totalAmount || 0);
        const totalDiscount = formatCurrency(salesStats[0]?.totalDiscount || 0);
        const totalFinalAmount = formatCurrency(salesStats[0]?.totalFinalAmount || 0);
        const totalMaxDistributions = couponStats[0]?.totalMaxDistributions || 0;
        const totalCurrentDistributions = couponStats[0]?.totalCurrentDistributions || 0;
        const avgDiscountPercentage = formatCurrency(couponStats[0]?.avgDiscountPercentage || 0);
        const totalSales = salesStats[0]?.totalSales || 0;
        const totalCoupons = couponStats[0]?.totalCoupons || 0;
        const totalUsedCoupons = userCouponStats[0]?.totalUsedCoupons || 0;

        const redeemRate = calculateRedeemRate(totalCurrentDistributions, totalMaxDistributions);
        const salesConversionRate = calculateRedeemRate(totalUsedCoupons, totalCurrentDistributions);

        const response = {
            success: true,
            data: {
                partnerInfo: {
                    firmName: partnerProfile?.firm_name || "Your Firm",
                    logo: partnerProfile?.logo || null,
                    city: partnerProfile?.address?.city || "",
                    state: partnerProfile?.address?.state || ""
                },
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    period: period || 'all-time'
                },
                overview: {
                    totalAmount,
                    totalDiscount,
                    totalFinalAmount,
                    totalCoupons,
                    totalMaxDistributions,
                    totalCurrentDistributions,
                    totalUsedCoupons,
                    remainingDistributions: totalMaxDistributions - totalCurrentDistributions,
                    avgDiscountPercentage,
                    redeemRate: formatCurrency(redeemRate),
                    salesConversionRate: formatCurrency(salesConversionRate),
                    totalSales
                }
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching dashboard statistics",
            error: error.message
        });
    }
};

// ==============================
// COUPONS LIST CONTROLLER - FIXED
// ==============================

export const getCouponsList = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const { fromDate, toDate, status, search } = req.query;
        const skip = (page - 1) * limit;

        // Build filters
        const dateFilter = buildDateFilter(fromDate, toDate);

        let statusFilter = {};
        const now = new Date();

        if (status === 'active') {
            statusFilter = {
                validTill: { $gte: now },
                $expr: { $lt: ["$currentDistributions", "$maxDistributions"] }
            };
        } else if (status === 'expired') {
            statusFilter.validTill = { $lt: now };
        } else if (status === 'fully-redeemed') {
            statusFilter.$expr = { $eq: ["$currentDistributions", "$maxDistributions"] };
        } else if (status === 'partially-redeemed') {
            statusFilter.$expr = {
                $and: [
                    { $gt: ["$currentDistributions", 0] },
                    { $lt: ["$currentDistributions", "$maxDistributions"] }
                ]
            };
        }

        let searchFilter = {};
        if (search) {
            searchFilter = {
                $or: [
                    { title: { $regex: search, $options: 'i' } },
                    { shop_name: { $regex: search, $options: 'i' } },
                    { copuon_srno: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const baseFilter = {
            ownerId: userId,
            ...dateFilter,
            ...statusFilter,
            ...searchFilter
        };

        // Execute queries in parallel
        const [coupons, totalCoupons, salesData] = await Promise.all([
            Coupon.find(baseFilter)
                .select('title validTill discountPercentage maxDistributions currentDistributions shop_name copuon_srno createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Coupon.countDocuments(baseFilter),

            // Get sales data for these coupons
            Sales.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo"
                    }
                },
                {
                    $unwind: "$couponInfo"
                },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "completed"
                    }
                },
                {
                    $group: {
                        _id: "$couponId",
                        totalSales: { $sum: 1 },
                        totalRevenue: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" }
                    }
                }
            ])
        ]);

        // Create sales map for quick lookup
        const salesMap = {};
        salesData.forEach(sale => {
            salesMap[sale._id.toString()] = {
                totalSales: sale.totalSales,
                totalRevenue: sale.totalRevenue,
                totalDiscount: sale.totalDiscount
            };
        });

        // Format coupon data
        const formattedCoupons = coupons.map(coupon => {
            const baseAmount = coupon.maxDistributions * 100; // Assuming 100 per distribution
            const discountPercentage = parseFloat(coupon.discountPercentage) || 0;
            const discountAmount = (baseAmount * discountPercentage) / 100;

            const couponSales = salesMap[coupon._id.toString()] || {
                totalSales: 0,
                totalRevenue: 0,
                totalDiscount: 0
            };

            const status = getCouponStatus(
                coupon.validTill,
                coupon.currentDistributions,
                coupon.maxDistributions
            );

            return {
                id: coupon._id,
                title: coupon.title,
                shopName: coupon.shop_name,
                couponSerial: coupon.copuon_srno,
                validTill: coupon.validTill,
                discountPercentage: coupon.discountPercentage,
                maxDistributions: coupon.maxDistributions,
                currentDistributions: coupon.currentDistributions,
                remainingDistributions: coupon.maxDistributions - coupon.currentDistributions,
                amount: baseAmount,
                discountAmount: formatCurrency(discountAmount),
                usedCount: coupon.currentDistributions,
                totalDistributed: coupon.maxDistributions,
                salesData: {
                    totalSales: couponSales.totalSales,
                    totalRevenue: formatCurrency(couponSales.totalRevenue),
                    totalDiscount: formatCurrency(couponSales.totalDiscount)
                },
                status,
                isExpired: new Date(coupon.validTill) < new Date(),
                isFullyRedeemed: coupon.currentDistributions >= coupon.maxDistributions,
                createdAt: coupon.createdAt
            };
        });

        res.status(200).json({
            success: true,
            data: {
                coupons: formattedCoupons,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCoupons / limit),
                    totalCoupons,
                    hasNext: page < Math.ceil(totalCoupons / limit),
                    hasPrev: page > 1,
                    limit
                },
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    status: status || 'all',
                    search: search || ''
                }
            }
        });

    } catch (error) {
        console.error("Coupons list error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching coupons list",
            error: error.message
        });
    }
};

// ==============================
// SALES ANALYTICS CONTROLLER - FIXED
// ==============================

export const getSalesAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, groupBy = 'day' } = req.query;

        const dateFilter = buildDateFilter(fromDate, toDate);

        let groupFormat;
        switch (groupBy) {
            case 'week':
                groupFormat = { week: { $week: "$createdAt" }, year: { $year: "$createdAt" } };
                break;
            case 'month':
                groupFormat = { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
                break;
            default:
                groupFormat = {
                    day: { $dayOfMonth: "$createdAt" },
                    month: { $month: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
        }

        const analytics = await Sales.aggregate([
            {
                $lookup: {
                    from: "coupons",
                    localField: "couponId",
                    foreignField: "_id",
                    as: "couponInfo"
                }
            },
            {
                $unwind: "$couponInfo"
            },
            {
                $match: {
                    "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                    status: "completed",
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: groupFormat,
                    totalAmount: { $sum: "$amount" },
                    totalDiscount: { $sum: "$discountAmount" },
                    totalFinalAmount: { $sum: "$finalAmount" },
                    totalSales: { $sum: 1 },
                    date: { $first: "$createdAt" }
                }
            },
            {
                $sort: {
                    "_id.year": 1,
                    "_id.month": 1,
                    "_id.day": 1,
                    "_id.week": 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                analytics,
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    groupBy
                }
            }
        });

    } catch (error) {
        console.error("Sales analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching sales analytics",
            error: error.message
        });
    }
};

// ==============================
// USER COUPONS ANALYTICS - NEW ENDPOINT
// ==============================

export const getUserCouponsAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate } = req.query;

        const dateFilter = buildDateFilter(fromDate, toDate);

        const analytics = await UserCoupon.aggregate([
            {
                $lookup: {
                    from: "coupons",
                    localField: "couponId",
                    foreignField: "_id",
                    as: "couponInfo"
                }
            },
            {
                $unwind: "$couponInfo"
            },
            {
                $match: {
                    "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    coupons: { $push: "$couponId" }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                analytics,
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null
                }
            }
        });

    } catch (error) {
        console.error("User coupons analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user coupons analytics",
            error: error.message
        });
    }
};

// ==============================
// ENHANCED PDF EXPORT CONTROLLER - FIXED
// ==============================

export const exportDashboardPDF = async (req, res) => {
    req.socket.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;

        // Get partner profile
        const partnerProfile = await PatnerProfile.findOne({ User_id: userId });

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && !fromDate && !toDate) {
            const periodFilter = buildPeriodFilter(period);
            dateFilter = { ...dateFilter, ...periodFilter };
        }

        // Enhanced data fetching with better error handling
        const [couponStats, salesStats, userCouponStats, coupons, salesAnalytics] = await Promise.all([
            // Enhanced coupon statistics with better grouping
            Coupon.aggregate([
                {
                    $match: {
                        ownerId: new mongoose.Types.ObjectId(userId),
                        ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {})
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalMaxDistributions: { $sum: "$maxDistributions" },
                        totalCurrentDistributions: { $sum: "$currentDistributions" },
                        avgDiscountPercentage: { $avg: { $toDouble: "$discountPercentage" } },
                        totalCoupons: { $sum: 1 },
                        totalPotentialRevenue: { 
                            $sum: { 
                                $multiply: [
                                    "$maxDistributions", 
                                    100 // Base amount per coupon
                                ] 
                            } 
                        },
                        totalActualRevenue: {
                            $sum: {
                                $multiply: [
                                    "$currentDistributions",
                                    100
                                ]
                            }
                        }
                    }
                }
            ]),

            // Enhanced sales statistics
            Sales.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo"
                    }
                },
                {
                    $unwind: "$couponInfo"
                },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "completed",
                        ...dateFilter
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" },
                        totalSales: { $sum: 1 },
                        totalFinalAmount: { $sum: "$finalAmount" },
                        avgTransactionValue: { $avg: "$finalAmount" },
                        maxTransactionValue: { $max: "$finalAmount" },
                        minTransactionValue: { $min: "$finalAmount" }
                    }
                }
            ]),

            // Enhanced user coupon statistics
            UserCoupon.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo"
                    }
                },
                {
                    $unwind: "$couponInfo"
                },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "used",
                        ...dateFilter
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalUsedCoupons: { $sum: 1 },
                        uniqueCustomers: { $addToSet: "$userId" }
                    }
                }
            ]),

            // Enhanced coupons list with better sorting
            Coupon.find({
                ownerId: userId,
                ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {})
            })
                .select('title validTill discountPercentage maxDistributions currentDistributions shop_name copuon_srno createdAt')
                .sort({ currentDistributions: -1, createdAt: -1 })
                .limit(100)
                .lean(),

            // Enhanced sales analytics with daily/monthly breakdown
            Sales.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo"
                    }
                },
                {
                    $unwind: "$couponInfo"
                },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "completed",
                        ...dateFilter
                    }
                },
                {
                    $group: {
                        _id: {
                            date: {
                                $dateToString: {
                                    format: "%Y-%m-%d",
                                    date: "$createdAt"
                                }
                            }
                        },
                        totalAmount: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" },
                        totalFinalAmount: { $sum: "$finalAmount" },
                        totalSales: { $sum: 1 },
                        date: { $first: "$createdAt" }
                    }
                },
                {
                    $sort: { "_id.date": 1 }
                }
            ])
        ]);

        // Enhanced stats calculation with accurate pricing
        const totalAmount = salesStats[0]?.totalAmount || 0;
        const totalDiscount = salesStats[0]?.totalDiscount || 0;
        const totalFinalAmount = salesStats[0]?.totalFinalAmount || 0;
        const totalMaxDistributions = couponStats[0]?.totalMaxDistributions || 0;
        const totalCurrentDistributions = couponStats[0]?.totalCurrentDistributions || 0;
        const avgDiscountPercentage = couponStats[0]?.avgDiscountPercentage || 0;
        const totalSales = salesStats[0]?.totalSales || 0;
        const totalCoupons = couponStats[0]?.totalCoupons || 0;
        const totalUsedCoupons = userCouponStats[0]?.totalUsedCoupons || 0;
        const uniqueCustomers = userCouponStats[0]?.uniqueCustomers?.length || 0;
        const avgTransactionValue = salesStats[0]?.avgTransactionValue || 0;
        const maxTransactionValue = salesStats[0]?.maxTransactionValue || 0;
        const minTransactionValue = salesStats[0]?.minTransactionValue || 0;

        const redeemRate = calculateRedeemRate(totalCurrentDistributions, totalMaxDistributions);
        const salesConversionRate = calculateRedeemRate(totalUsedCoupons, totalCurrentDistributions);
        const customerRetentionRate = uniqueCustomers > 0 ? ((totalUsedCoupons / uniqueCustomers) * 100).toFixed(2) : 0;

        const stats = {
            partnerInfo: {
                firmName: partnerProfile?.firm_name || "Your Firm",
                logo: partnerProfile?.logo || null,
                city: partnerProfile?.address?.city || "",
                state: partnerProfile?.address?.state || "",
                contact: partnerProfile?.contact_number || "",
                email: partnerProfile?.email || ""
            },
            filters: {
                fromDate: fromDate || null,
                toDate: toDate || null,
                period: period || 'all-time'
            },
            overview: {
                totalAmount: formatCurrency(totalAmount),
                totalDiscount: formatCurrency(totalDiscount),
                totalFinalAmount: formatCurrency(totalFinalAmount),
                totalCoupons,
                totalMaxDistributions,
                totalCurrentDistributions,
                totalUsedCoupons,
                remainingDistributions: totalMaxDistributions - totalCurrentDistributions,
                avgDiscountPercentage: formatCurrency(avgDiscountPercentage),
                redeemRate: formatCurrency(redeemRate),
                salesConversionRate: formatCurrency(salesConversionRate),
                totalSales,
                uniqueCustomers,
                avgTransactionValue: formatCurrency(avgTransactionValue),
                maxTransactionValue: formatCurrency(maxTransactionValue),
                minTransactionValue: formatCurrency(minTransactionValue),
                customerRetentionRate
            }
        };

        // Enhanced coupon formatting with accurate revenue calculations
        const formattedCoupons = coupons.map(coupon => {
            const baseAmount = coupon.maxDistributions * 100;
            const discountPercentage = parseFloat(coupon.discountPercentage) || 0;
            const discountAmount = (baseAmount * discountPercentage) / 100;
            const potentialRevenue = baseAmount;
            const actualRevenue = coupon.currentDistributions * 100;
            const revenueEfficiency = potentialRevenue > 0 ? (actualRevenue / potentialRevenue) * 100 : 0;

            const status = getCouponStatus(
                coupon.validTill,
                coupon.currentDistributions,
                coupon.maxDistributions
            );

            return {
                id: coupon._id,
                title: coupon.title,
                shopName: coupon.shop_name,
                couponSerial: coupon.copuon_srno,
                validTill: coupon.validTill,
                discountPercentage: coupon.discountPercentage,
                maxDistributions: coupon.maxDistributions,
                currentDistributions: coupon.currentDistributions,
                remainingDistributions: coupon.maxDistributions - coupon.currentDistributions,
                amount: baseAmount,
                discountAmount: formatCurrency(discountAmount),
                potentialRevenue: formatCurrency(potentialRevenue),
                actualRevenue: formatCurrency(actualRevenue),
                revenueEfficiency: revenueEfficiency.toFixed(2),
                usedCount: coupon.currentDistributions,
                totalDistributed: coupon.maxDistributions,
                status,
                isExpired: new Date(coupon.validTill) < new Date(),
                isFullyRedeemed: coupon.currentDistributions >= coupon.maxDistributions,
                createdAt: coupon.createdAt
            };
        });

        const allCoupons = formattedCoupons;
        const analytics = salesAnalytics;

        // Enhanced sorting with revenue-based ranking
        const topCoupons = [...allCoupons]
            .sort((a, b) => b.actualRevenue - a.actualRevenue)
            .slice(0, 25);

        // Create professional PDF document
        const doc = new PDFDocument({
            margin: 40,
            size: 'A4',
            bufferPages: true,
            info: {
                Title: `${stats.partnerInfo.firmName} - Comprehensive Performance Report`,
                Author: 'Partner Analytics Dashboard',
                CreationDate: new Date(),
                Subject: 'Business Performance Analytics'
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `attachment; filename="${stats.partnerInfo.firmName.replace(/[^a-zA-Z0-9]/g, '_')}_Performance_Report_${new Date().toISOString().slice(0, 10)}.pdf"`
        );

        doc.pipe(res);

        // ===== PROFESSIONAL PDF STYLING =====
        const primaryColor = '#1e3a8a'; // Professional blue
        const secondaryColor = '#0f766e'; // Teal
        const accentColor = '#dc2626'; // Red
        const successColor = '#059669'; // Green
        const warningColor = '#d97706'; // Amber
        const lightColor = '#f8fafc';
        const darkColor = '#1e293b';

        const bold = 'Helvetica-Bold';
        const regular = 'Helvetica';
        const light = 'Helvetica-Light';

        // Helper function for formatted currency
        const formatCurrencyWithSymbol = (amount) => {
            return `₹${formatCurrency(amount)}`;
        };

        // ===== COVER PAGE =====
        doc.fillColor(primaryColor)
            .rect(0, 0, doc.page.width, 150)
            .fill();

        doc.fillColor('white')
            .fontSize(24)
            .font(bold)
            .text('PERFORMANCE ANALYTICS REPORT', 0, 60, { align: 'center' });

        doc.fontSize(16)
            .font(light)
            .text(stats.partnerInfo.firmName, 0, 100, { align: 'center' });

        doc.fillColor(darkColor)
            .fontSize(12)
            .text('Comprehensive Business Performance Analysis', 0, 200, { align: 'center' });

        // Report period box
        const periodText = period
            ? period.charAt(0).toUpperCase() + period.slice(1).replace('-', ' ')
            : fromDate && toDate
                ? `${new Date(fromDate).toLocaleDateString()} - ${new Date(toDate).toLocaleDateString()}`
                : "All Time";

        doc.fillColor(lightColor)
            .rect(150, 250, 300, 40)
            .fill();

        doc.fillColor(primaryColor)
            .fontSize(12)
            .font(bold)
            .text('REPORT PERIOD', 0, 260, { align: 'center' })
            .fontSize(14)
            .text(periodText, 0, 280, { align: 'center' });

        // Generated date
        doc.fillColor(darkColor)
            .fontSize(10)
            .font(regular)
            .text(`Generated on: ${new Date().toLocaleDateString('en-IN', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}`, 0, 350, { align: 'center' });

        doc.addPage();

        // ===== EXECUTIVE SUMMARY =====
        doc.fillColor(primaryColor)
            .fontSize(18)
            .font(bold)
            .text('EXECUTIVE SUMMARY', 50, 50)
            .moveDown(1.5);

        // Partner Information
        doc.fillColor(darkColor)
            .fontSize(12)
            .font(bold)
            .text('Business Information:', 50, doc.y);

        doc.font(regular)
            .fontSize(10)
            .text(`Firm Name: ${stats.partnerInfo.firmName}`, 50, doc.y + 15)
            .text(`Location: ${stats.partnerInfo.city}${stats.partnerInfo.state ? ', ' + stats.partnerInfo.state : ''}`, 50, doc.y + 30);

        if (stats.partnerInfo.contact || stats.partnerInfo.email) {
            doc.text(`Contact: ${stats.partnerInfo.contact || 'N/A'}`, 50, doc.y + 45);
            if (stats.partnerInfo.email) {
                doc.text(`Email: ${stats.partnerInfo.email}`, 50, doc.y + 60);
            }
        }

        doc.moveDown(3);

        // ===== KEY PERFORMANCE INDICATORS =====
        doc.fillColor(primaryColor)
            .fontSize(16)
            .font(bold)
            .text('KEY PERFORMANCE INDICATORS', 50, doc.y)
            .moveDown(1);

        const kpis = [
            { 
                label: "TOTAL REVENUE", 
                value: formatCurrencyWithSymbol(totalAmount),
                sublabel: "Gross Revenue",
                color: successColor
            },
            { 
                label: "NET REVENUE", 
                value: formatCurrencyWithSymbol(totalFinalAmount),
                sublabel: "After Discounts",
                color: secondaryColor
            },
            { 
                label: "TOTAL DISCOUNTS", 
                value: formatCurrencyWithSymbol(totalDiscount),
                sublabel: "Discounts Provided",
                color: warningColor
            },
            { 
                label: "TOTAL SALES", 
                value: totalSales.toLocaleString(),
                sublabel: "Completed Transactions",
                color: primaryColor
            },
            { 
                label: "AVG TRANSACTION", 
                value: formatCurrencyWithSymbol(avgTransactionValue),
                sublabel: "Per Sale",
                color: accentColor
            },
            { 
                label: "REDEMPTION RATE", 
                value: `${stats.overview.redeemRate}%`,
                sublabel: "Coupon Utilization",
                color: successColor
            }
        ];

        const kpiWidth = 160;
        const kpiHeight = 80;
        const kpiStartY = doc.y;

        kpis.forEach((kpi, index) => {
            const row = Math.floor(index / 3);
            const col = index % 3;
            const x = 50 + col * (kpiWidth + 15);
            const y = kpiStartY + row * (kpiHeight + 15);

            // KPI Box
            doc.rect(x, y, kpiWidth, kpiHeight)
                .fillColor(lightColor)
                .fill()
                .strokeColor('#e2e8f0')
                .stroke();

            // Value
            doc.fillColor(kpi.color)
                .fontSize(16)
                .font(bold)
                .text(kpi.value, x + 10, y + 15, { width: kpiWidth - 20, align: 'center' });

            // Label
            doc.fillColor(darkColor)
                .fontSize(10)
                .font(bold)
                .text(kpi.label, x + 10, y + 40, { width: kpiWidth - 20, align: 'center' });

            // Sublabel
            doc.fillColor('#64748b')
                .fontSize(8)
                .font(regular)
                .text(kpi.sublabel, x + 10, y + 55, { width: kpiWidth - 20, align: 'center' });
        });

        doc.moveDown(8);

        // ===== DETAILED COUPON PERFORMANCE =====
        if (topCoupons.length > 0) {
            doc.addPage();
            
            doc.fillColor(primaryColor)
                .fontSize(18)
                .font(bold)
                .text('TOP PERFORMING COUPONS', 50, 50)
                .moveDown(1);

            doc.fillColor(darkColor)
                .fontSize(10)
                .font(regular)
                .text(`Showing top ${topCoupons.length} coupons by revenue performance`, 50, doc.y)
                .moveDown(0.5);

            // Table Header
            const tableTop = doc.y + 10;
            doc.fillColor(primaryColor)
                .rect(50, tableTop, 500, 20)
                .fill();

            doc.fillColor('white')
                .fontSize(9)
                .font(bold)
                .text('Rank', 55, tableTop + 7)
                .text('Coupon Title', 80, tableTop + 7)
                .text('Serial', 200, tableTop + 7)
                .text('Discount', 260, tableTop + 7)
                .text('Distributed', 320, tableTop + 7)
                .text('Revenue', 390, tableTop + 7)
                .text('Efficiency', 460, tableTop + 7)
                .text('Status', 520, tableTop + 7);

            let currentY = tableTop + 25;

            topCoupons.forEach((coupon, index) => {
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }

                // Alternate row colors
                if (index % 2 === 0) {
                    doc.fillColor(lightColor)
                        .rect(50, currentY, 500, 20)
                        .fill();
                }

                const utilizationRate = coupon.maxDistributions > 0
                    ? ((coupon.currentDistributions / coupon.maxDistributions) * 100).toFixed(1)
                    : 0;

                doc.fillColor(darkColor)
                    .fontSize(8)
                    .font(regular)
                    .text((index + 1).toString(), 55, currentY + 7)
                    .text(coupon.title.length > 25 ? coupon.title.substring(0, 25) + '...' : coupon.title, 80, currentY + 7)
                    .text(coupon.couponSerial, 200, currentY + 7)
                    .text(`${coupon.discountPercentage}%`, 260, currentY + 7)
                    .text(`${coupon.currentDistributions}/${coupon.maxDistributions}`, 320, currentY + 7)
                    .text(formatCurrencyWithSymbol(coupon.actualRevenue), 390, currentY + 7)
                    .text(`${coupon.revenueEfficiency}%`, 460, currentY + 7);

                // Status with color coding
                let statusColor = darkColor;
                if (coupon.status === 'Active') statusColor = successColor;
                if (coupon.status === 'Expired') statusColor = accentColor;
                if (coupon.status === 'Fully Redeemed') statusColor = warningColor;

                doc.fillColor(statusColor)
                    .text(coupon.status, 520, currentY + 7);

                currentY += 20;
            });

            doc.moveDown(2);
        }

        // ===== SALES ANALYTICS TIMELINE =====
        if (analytics.length > 0) {
            doc.addPage();
            
            doc.fillColor(primaryColor)
                .fontSize(18)
                .font(bold)
                .text('SALES ANALYTICS TIMELINE', 50, 50)
                .moveDown(1);

            // Enhanced table with more metrics
            const analyticsTop = doc.y + 10;
            
            // Table Header
            doc.fillColor(primaryColor)
                .rect(50, analyticsTop, 500, 20)
                .fill();

            doc.fillColor('white')
                .fontSize(9)
                .font(bold)
                .text('Date', 55, analyticsTop + 7)
                .text('Sales', 120, analyticsTop + 7)
                .text('Gross Revenue', 180, analyticsTop + 7)
                .text('Discounts', 260, analyticsTop + 7)
                .text('Net Revenue', 340, analyticsTop + 7)
                .text('Avg. Sale', 420, analyticsTop + 7)
                .text('Growth', 500, analyticsTop + 7);

            let currentY = analyticsTop + 25;
            let previousRevenue = 0;

            analytics.slice(-30).forEach((item, index) => {
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }

                if (index % 2 === 0) {
                    doc.fillColor(lightColor)
                        .rect(50, currentY, 500, 18)
                        .fill();
                }

                const avgSale = item.totalSales > 0 ? item.totalFinalAmount / item.totalSales : 0;
                const growth = previousRevenue > 0 
                    ? ((item.totalFinalAmount - previousRevenue) / previousRevenue * 100).toFixed(1)
                    : 0;

                doc.fillColor(darkColor)
                    .fontSize(8)
                    .font(regular)
                    .text(item._id.date, 55, currentY + 6)
                    .text(item.totalSales.toString(), 120, currentY + 6)
                    .text(formatCurrencyWithSymbol(item.totalAmount), 180, currentY + 6)
                    .text(formatCurrencyWithSymbol(item.totalDiscount), 260, currentY + 6)
                    .text(formatCurrencyWithSymbol(item.totalFinalAmount), 340, currentY + 6)
                    .text(formatCurrencyWithSymbol(avgSale), 420, currentY + 6);

                // Growth indicator with color
                if (index > 0) {
                    const growthColor = growth >= 0 ? successColor : accentColor;
                    doc.fillColor(growthColor)
                        .text(`${growth >= 0 ? '+' : ''}${growth}%`, 500, currentY + 6);
                } else {
                    doc.fillColor('#64748b')
                        .text('-', 500, currentY + 6);
                }

                previousRevenue = item.totalFinalAmount;
                currentY += 18;
            });
        }

        // ===== PERFORMANCE INSIGHTS =====
        doc.addPage();
        
        doc.fillColor(primaryColor)
            .fontSize(18)
            .font(bold)
            .text('PERFORMANCE INSIGHTS', 50, 50)
            .moveDown(1);

        const insights = [
            {
                title: "Revenue Performance",
                content: `Your business generated ${formatCurrencyWithSymbol(totalAmount)} in gross revenue with a net revenue of ${formatCurrencyWithSymbol(totalFinalAmount)} after ${formatCurrencyWithSymbol(totalDiscount)} in discounts.`
            },
            {
                title: "Coupon Efficiency",
                content: `Out of ${totalMaxDistributions.toLocaleString()} total distributions, ${totalCurrentDistributions.toLocaleString()} were utilized, achieving a ${stats.overview.redeemRate}% redemption rate.`
            },
            {
                title: "Customer Engagement",
                content: `You served ${uniqueCustomers} unique customers with an average transaction value of ${formatCurrencyWithSymbol(avgTransactionValue)}.`
            },
            {
                title: "Sales Conversion",
                content: `Your sales conversion rate stands at ${stats.overview.salesConversionRate}%, indicating strong coupon-to-sale conversion performance.`
            }
        ];

        insights.forEach((insight, index) => {
            if (doc.y > 600) {
                doc.addPage();
            }

            doc.fillColor(secondaryColor)
                .fontSize(11)
                .font(bold)
                .text(`${index + 1}. ${insight.title}`, 50, doc.y);

            doc.fillColor(darkColor)
                .fontSize(10)
                .font(regular)
                .text(insight.content, 70, doc.y + 15, { width: 470, align: 'justify' });

            doc.moveDown(1.5);
        });

        // ===== PROFESSIONAL FOOTER =====
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            
            // Page number
            doc.fillColor('#64748b')
                .fontSize(8)
                .text(
                    `Page ${i + 1} of ${totalPages}`,
                    50,
                    doc.page.height - 30
                );

            // Confidential footer
            doc.text(
                `Confidential - ${stats.partnerInfo.firmName} Performance Report`,
                doc.page.width - 250,
                doc.page.height - 30,
                { width: 200, align: 'right' }
            );

            // Bottom border
            doc.moveTo(50, doc.page.height - 40)
                .lineTo(doc.page.width - 50, doc.page.height - 40)
                .strokeColor('#e2e8f0')
                .lineWidth(0.5)
                .stroke();
        }

        doc.end();

    } catch (error) {
        console.error("PDF export error:", error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "Error generating PDF report",
                error: error.message
            });
        }
    }
};