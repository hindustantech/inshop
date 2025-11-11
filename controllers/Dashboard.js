import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
import UserCoupon from "../models/UserCoupon.js";
import PatnerProfile from "../models/PatnerProfile.js";
import PDFDocument from 'pdfkit';
import mongoose from "mongoose";

// ==============================
// ENHANCED HELPER FUNCTIONS
// ==============================

/**
 * Build comprehensive date filter for MongoDB queries
 */
const buildDateFilter = (fromDate, toDate, timestampField = 'createdAt') => {
    const filter = {};

    if (fromDate && toDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);

        filter[timestampField] = {
            $gte: startDate,
            $lte: endDate
        };
    } else if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        filter[timestampField] = { $gte: startDate };
    } else if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        filter[timestampField] = { $lte: endDate };
    }

    return filter;
};

/**
 * Build period filter with proper date ranges
 */
const buildPeriodFilter = (period, timestampField = 'createdAt') => {
    if (!period) return {};

    const startDate = new Date();
    const endDate = new Date();

    switch (period) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'yesterday':
            startDate.setDate(startDate.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(endDate.getDate() - 1);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'week':
            startDate.setDate(startDate.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'month':
            startDate.setMonth(startDate.getMonth() - 1);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'year':
            startDate.setFullYear(startDate.getFullYear() - 1);
            startDate.setHours(0, 0, 0, 0);
            break;
        default:
            return {};
    }

    return {
        [timestampField]: {
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

/**
 * Generate date range label
 */
const getDateRangeLabel = (fromDate, toDate, period) => {
    if (fromDate && toDate) {
        return `${new Date(fromDate).toLocaleDateString()} - ${new Date(toDate).toLocaleDateString()}`;
    }

    const periodLabels = {
        'today': 'Today',
        'yesterday': 'Yesterday',
        'week': 'Last 7 Days',
        'month': 'Last 30 Days',
        'year': 'Last Year',
        'all-time': 'All Time'
    };

    return periodLabels[period] || 'All Time';
};



// ==============================
// ENHANCED COUPONS LIST CONTROLLER
// ==============================

export const getCouponsList = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            page = 1,
            limit = 10,
            fromDate,
            toDate,
            status,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit), 100);
        const skip = (pageNum - 1) * limitNum;

        // Build filters
        const dateFilter = buildDateFilter(fromDate, toDate);

        let statusFilter = {};
        const now = new Date();

        // Enhanced status filtering
        if (status) {
            switch (status) {
                case 'active':
                    statusFilter = {
                        validTill: { $gte: now },
                        $expr: { $lt: ["$currentDistributions", "$maxDistributions"] }
                    };
                    break;
                case 'expired':
                    statusFilter.validTill = { $lt: now };
                    break;
                case 'fully-redeemed':
                    statusFilter.$expr = { $eq: ["$currentDistributions", "$maxDistributions"] };
                    break;
                case 'partially-redeemed':
                    statusFilter.$expr = {
                        $and: [
                            { $gt: ["$currentDistributions", 0] },
                            { $lt: ["$currentDistributions", "$maxDistributions"] }
                        ]
                    };
                    break;
                case 'inactive':
                    statusFilter.active = false;
                    break;
                default:
                // No status filter
            }
        }

        // Enhanced search filter
        let searchFilter = {};
        if (search) {
            searchFilter = {
                $or: [
                    { title: { $regex: search, $options: 'i' } },
                    { shop_name: { $regex: search, $options: 'i' } },
                    { copuon_srno: { $regex: search, $options: 'i' } },
                    { manul_address: { $regex: search, $options: 'i' } },
                    { "tag": { $in: [new RegExp(search, 'i')] } }
                ]
            };
        }

        // Sort configuration
        const sortConfig = {};
        const validSortFields = ['createdAt', 'title', 'validTill', 'currentDistributions', 'discountPercentage', 'maxDistributions'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
        sortConfig[sortField] = sortOrder === 'asc' ? 1 : -1;

        // Base filter
        const baseFilter = {
            ownerId: new mongoose.Types.ObjectId(userId),
            ...dateFilter,
            ...statusFilter,
            ...searchFilter
        };

        console.log('Base Filter:', JSON.stringify(baseFilter, null, 2));

        // Execute parallel queries for better performance
        const [coupons, totalCoupons, salesData, statusCounts] = await Promise.all([
            // Get coupons with pagination and sorting
            Coupon.find(baseFilter)
                .select('title validTill discountPercentage maxDistributions currentDistributions shop_name copuon_srno createdAt active manul_address tag is_spacial_copun coupon_color')
                .populate('category', 'name')
                .sort(sortConfig)
                .skip(skip)
                .limit(limitNum)
                .lean(),

            // Total count for pagination
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
                        totalDiscount: { $sum: "$discountAmount" },
                        totalFinalAmount: { $sum: "$finalAmount" }
                    }
                }
            ]),

            // Get status counts for filters
            Coupon.aggregate([
                {
                    $match: {
                        ownerId: new mongoose.Types.ObjectId(userId),
                        ...dateFilter,
                        ...searchFilter
                    }
                },
                {
                    $facet: {
                        active: [
                            {
                                $match: {
                                    validTill: { $gte: now },
                                    $expr: { $lt: ["$currentDistributions", "$maxDistributions"] },
                                    active: true
                                }
                            },
                            { $count: "count" }
                        ],
                        expired: [
                            {
                                $match: {
                                    validTill: { $lt: now }
                                }
                            },
                            { $count: "count" }
                        ],
                        fullyRedeemed: [
                            {
                                $match: {
                                    $expr: { $eq: ["$currentDistributions", "$maxDistributions"] }
                                }
                            },
                            { $count: "count" }
                        ],
                        partiallyRedeemed: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $gt: ["$currentDistributions", 0] },
                                            { $lt: ["$currentDistributions", "$maxDistributions"] }
                                        ]
                                    }
                                }
                            },
                            { $count: "count" }
                        ],
                        inactive: [
                            {
                                $match: {
                                    active: false
                                }
                            },
                            { $count: "count" }
                        ],
                        total: [
                            { $count: "count" }
                        ]
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
                totalDiscount: sale.totalDiscount,
                totalFinalAmount: sale.totalFinalAmount
            };
        });

        // Format coupon data with enhanced information
        const formattedCoupons = coupons.map(coupon => {
            const baseAmount = coupon.maxDistributions * 100; // Assuming 100 per distribution
            const discountPercentage = parseFloat(coupon.discountPercentage) || 0;
            const discountAmount = (baseAmount * discountPercentage) / 100;

            const couponSales = salesMap[coupon._id.toString()] || {
                totalSales: 0,
                totalRevenue: 0,
                totalDiscount: 0,
                totalFinalAmount: 0
            };

            const status = getCouponStatus(
                coupon.validTill,
                coupon.currentDistributions,
                coupon.maxDistributions
            );

            const isExpired = new Date(coupon.validTill) < new Date();
            const isFullyRedeemed = coupon.currentDistributions >= coupon.maxDistributions;
            const utilizationRate = calculateRedeemRate(coupon.currentDistributions, coupon.maxDistributions);

            return {
                id: coupon._id,
                title: coupon.title,
                shopName: coupon.shop_name,
                couponSerial: coupon.copuon_srno,
                manualAddress: coupon.manul_address,
                validTill: coupon.validTill,
                discountPercentage: discountPercentage,
                maxDistributions: coupon.maxDistributions,
                currentDistributions: coupon.currentDistributions,
                remainingDistributions: Math.max(0, coupon.maxDistributions - coupon.currentDistributions),
                amount: baseAmount,
                discountAmount: formatCurrency(discountAmount),
                usedCount: coupon.currentDistributions,
                totalDistributed: coupon.maxDistributions,
                salesData: {
                    totalSales: couponSales.totalSales,
                    totalRevenue: formatCurrency(couponSales.totalRevenue),
                    totalDiscount: formatCurrency(couponSales.totalDiscount),
                    totalFinalAmount: formatCurrency(couponSales.totalFinalAmount),
                    averageOrderValue: couponSales.totalSales > 0 ?
                        formatCurrency(couponSales.totalFinalAmount / couponSales.totalSales) : 0
                },
                status,
                isActive: coupon.active,
                isExpired,
                isFullyRedeemed,
                isSpecialCoupon: coupon.is_spacial_copun,
                couponColor: coupon.coupon_color,
                tags: coupon.tag || [],
                categories: coupon.category || [],
                utilizationRate: formatCurrency(utilizationRate),
                daysUntilExpiry: isExpired ? 0 : Math.ceil((new Date(coupon.validTill) - now) / (1000 * 60 * 60 * 24)),
                createdAt: coupon.createdAt,
                updatedAt: coupon.updatedAt
            };
        });

        // Process status counts
        const statusCountsResult = statusCounts[0] || {};
        const statusSummary = {
            all: statusCountsResult.total?.[0]?.count || 0,
            active: statusCountsResult.active?.[0]?.count || 0,
            expired: statusCountsResult.expired?.[0]?.count || 0,
            fullyRedeemed: statusCountsResult.fullyRedeemed?.[0]?.count || 0,
            partiallyRedeemed: statusCountsResult.partiallyRedeemed?.[0]?.count || 0,
            inactive: statusCountsResult.inactive?.[0]?.count || 0
        };

        res.status(200).json({
            success: true,
            data: {
                coupons: formattedCoupons,
                summary: {
                    totalCoupons: statusSummary.all,
                    statusBreakdown: statusSummary,
                    totalActive: statusSummary.active,
                    totalExpired: statusSummary.expired,
                    totalRedeemed: statusSummary.fullyRedeemed + statusSummary.partiallyRedeemed,
                    overallUtilization: totalCoupons > 0 ?
                        formatCurrency(coupons.reduce((sum, coupon) => sum + (coupon.currentDistributions / coupon.maxDistributions) * 100, 0) / coupons.length) : 0
                },
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalCoupons / limitNum),
                    totalCoupons,
                    hasNext: pageNum < Math.ceil(totalCoupons / limitNum),
                    hasPrev: pageNum > 1,
                    limit: limitNum
                },
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    status: status || 'all',
                    search: search || '',
                    sortBy,
                    sortOrder,
                    dateRangeLabel: getDateRangeLabel(fromDate, toDate)
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
// FIXED DASHBOARD STATISTICS CONTROLLER
// ==============================

export const getDashboardStats = async (req, res) => {
    try {
        // Extract user ID safely
        const userId = req?.user?.id;
        if (!userId) {
            return res?.status ? res.status(401).json({
                success: false,
                message: "User not authenticated"
            }) : { success: false, message: "User not authenticated" };
        }

        const { fromDate, toDate, period = 'all-time' } = req?.query || {};

        // Get partner profile
        const partnerProfile = await PatnerProfile.findOne({ User_id: userId });

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && period !== 'all-time' && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

        // Execute parallel queries for better performance
        const [couponStats, salesStats, userCouponStats, topCoupons] = await Promise.all([
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
                        totalCoupons: { $sum: 1 },
                        activeCoupons: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $gte: ["$validTill", new Date()] },
                                            { $lt: ["$currentDistributions", "$maxDistributions"] }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]),

            // Sales statistics - FIXED: Added proper error handling for lookup
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
                    $unwind: {
                        path: "$couponInfo",
                        preserveNullAndEmptyArrays: false // Only include records with valid coupon info
                    }
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
                        avgTransactionValue: { $avg: "$finalAmount" }
                    }
                }
            ]),

            // User coupon statistics - FIXED: Added proper error handling
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
                    $unwind: {
                        path: "$couponInfo",
                        preserveNullAndEmptyArrays: false
                    }
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
                        count: { $sum: 1 }
                    }
                }
            ]),

            // Top performing coupons
            Coupon.aggregate([
                {
                    $match: {
                        ownerId: new mongoose.Types.ObjectId(userId),
                        ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {})
                    }
                },
                {
                    $sort: { currentDistributions: -1 }
                },
                {
                    $limit: 5
                },
                {
                    $project: {
                        title: 1,
                        currentDistributions: 1,
                        maxDistributions: 1,
                        discountPercentage: 1,
                        shop_name: 1
                    }
                }
            ])
        ]);

        // Extract values with fallbacks - FIXED: Added proper default values
        const couponData = couponStats[0] || {};
        const salesData = salesStats[0] || {};
        const userCouponData = userCouponStats || [];

        const totalAmount = formatCurrency(salesData.totalAmount || 0);
        const totalDiscount = formatCurrency(salesData.totalDiscount || 0);
        const totalFinalAmount = formatCurrency(salesData.totalFinalAmount || 0);
        const totalMaxDistributions = couponData.totalMaxDistributions || 0;
        const totalCurrentDistributions = couponData.totalCurrentDistributions || 0;
        const avgDiscountPercentage = formatCurrency(couponData.avgDiscountPercentage || 0);
        const totalSales = salesData.totalSales || 0;
        const totalCoupons = couponData.totalCoupons || 0;
        const activeCoupons = couponData.activeCoupons || 0;

        // Calculate user coupon status counts
        const usedCoupons = userCouponData.find(item => item?._id === 'used')?.count || 0;
        const availableCoupons = userCouponData.find(item => item?._id === 'available')?.count || 0;

        const redeemRate = calculateRedeemRate(totalCurrentDistributions, totalMaxDistributions);
        const salesConversionRate = calculateRedeemRate(usedCoupons, totalCurrentDistributions);

        const response = {
            success: true,
            data: {
                partnerInfo: {
                    firmName: partnerProfile?.firm_name || "Your Firm",
                    logo: partnerProfile?.logo || null,
                    city: partnerProfile?.address?.city || "",
                    state: partnerProfile?.address?.state || "",
                    email: partnerProfile?.email || ""
                },
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    period: period,
                    dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
                },
                overview: {
                    // Financial Metrics
                    totalAmount,
                    totalDiscount,
                    totalFinalAmount,
                    avgTransactionValue: formatCurrency(salesData.avgTransactionValue || 0),

                    // Coupon Metrics
                    totalCoupons,
                    activeCoupons,
                    expiredCoupons: totalCoupons - activeCoupons,
                    totalMaxDistributions,
                    totalCurrentDistributions,
                    totalUsedCoupons: usedCoupons,
                    remainingDistributions: Math.max(0, totalMaxDistributions - totalCurrentDistributions),

                    // Performance Metrics
                    avgDiscountPercentage,
                    redeemRate: formatCurrency(redeemRate),
                    salesConversionRate: formatCurrency(salesConversionRate),
                    totalSales,

                    // User Coupon Status
                    availableCoupons,
                    usedCoupons,
                    transferredCoupons: userCouponData.find(item => item?._id === 'transferred')?.count || 0
                },
                topCoupons: topCoupons.map(coupon => ({
                    title: coupon.title,
                    shopName: coupon.shop_name,
                    currentDistributions: coupon.currentDistributions,
                    maxDistributions: coupon.maxDistributions,
                    discountPercentage: coupon.discountPercentage,
                    utilizationRate: calculateRedeemRate(coupon.currentDistributions, coupon.maxDistributions)
                }))
            }
        };

        // Return based on context (API call or internal call)
        if (res?.status) {
            return res.status(200).json(response);
        } else {
            return response;
        }

    } catch (error) {
        console.error("Dashboard stats error:", error);

        const errorResponse = {
            success: false,
            message: "Error fetching dashboard statistics",
            error: error.message
        };

        if (res?.status) {
            return res.status(500).json(errorResponse);
        } else {
            return errorResponse;
        }
    }
};

// ==============================
// ENHANCED SALES ANALYTICS CONTROLLER
// ==============================

// ==============================
// FIXED SALES ANALYTICS CONTROLLER
// ==============================

export const getSalesAnalytics = async (req, res) => {
    try {
        // Extract user ID safely
        const userId = req?.user?.id;
        if (!userId) {
            return res?.status ? res.status(401).json({
                success: false,
                message: "User not authenticated"
            }) : { success: false, message: "User not authenticated" };
        }

        const { fromDate, toDate, period = 'all-time', groupBy = 'day' } = req?.query || {};

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && period !== 'all-time' && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

        let groupFormat;

        switch (groupBy) {
            case 'hour':
                groupFormat = {
                    hour: { $hour: "$createdAt" },
                    day: { $dayOfMonth: "$createdAt" },
                    month: { $month: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
                break;
            case 'week':
                groupFormat = {
                    week: { $week: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
                break;
            case 'month':
                groupFormat = {
                    month: { $month: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
                break;
            default: // day
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
                $unwind: {
                    path: "$couponInfo",
                    preserveNullAndEmptyArrays: false
                }
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
                    averageOrderValue: { $avg: "$finalAmount" },
                    date: { $first: "$createdAt" }
                }
            },
            {
                $sort: {
                    "_id.year": 1,
                    "_id.month": 1,
                    "_id.day": 1,
                    "_id.week": 1,
                    "_id.hour": 1
                }
            },
            {
                $project: {
                    _id: 0,
                    period: "$_id",
                    totalAmount: 1,
                    totalDiscount: 1,
                    totalFinalAmount: 1,
                    totalSales: 1,
                    averageOrderValue: 1,
                    date: 1
                }
            }
        ]);

        // Format dates for better readability
        const formattedAnalytics = analytics.map(item => {
            let label = '';
            const date = new Date(item.date);

            switch (groupBy) {
                case 'hour':
                    label = date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit'
                    });
                    break;
                case 'week':
                    label = `Week ${date.getWeek()}, ${date.getFullYear()}`;
                    break;
                case 'month':
                    label = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                    break;
                default:
                    label = date.toLocaleDateString('en-US');
            }

            return {
                ...item,
                label,
                totalAmount: formatCurrency(item.totalAmount || 0),
                totalDiscount: formatCurrency(item.totalDiscount || 0),
                totalFinalAmount: formatCurrency(item.totalFinalAmount || 0),
                averageOrderValue: formatCurrency(item.averageOrderValue || 0)
            };
        });

        // Calculate summary statistics
        const summary = formattedAnalytics.reduce((acc, curr) => ({
            totalRevenue: acc.totalRevenue + (curr.totalFinalAmount || 0),
            totalDiscount: acc.totalDiscount + (curr.totalDiscount || 0),
            totalTransactions: acc.totalTransactions + (curr.totalSales || 0),
            periodCount: acc.periodCount + 1
        }), { totalRevenue: 0, totalDiscount: 0, totalTransactions: 0, periodCount: 0 });

        const response = {
            success: true,
            data: {
                analytics: formattedAnalytics,
                summary: {
                    totalRevenue: formatCurrency(summary.totalRevenue),
                    totalDiscount: formatCurrency(summary.totalDiscount),
                    totalTransactions: summary.totalTransactions,
                    averageRevenuePerPeriod: formatCurrency(summary.totalRevenue / Math.max(summary.periodCount, 1)),
                    averageTransactionsPerPeriod: formatCurrency(summary.totalTransactions / Math.max(summary.periodCount, 1))
                },
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    period,
                    groupBy,
                    dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
                }
            }
        };

        // Return based on context
        if (res?.status) {
            return res.status(200).json(response);
        } else {
            return response;
        }

    } catch (error) {
        console.error("Sales analytics error:", error);

        const errorResponse = {
            success: false,
            message: "Error fetching sales analytics",
            error: error.message
        };

        if (res?.status) {
            return res.status(500).json(errorResponse);
        } else {
            return errorResponse;
        }
    }
};

// Add week number utility to Date prototype
Date.prototype.getWeek = function () {
    const date = new Date(this.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

// ==============================
// ENHANCED COUPONS ANALYTICS CONTROLLER
// ==============================

// ==============================
// FIXED COUPONS ANALYTICS CONTROLLER
// ==============================

export const getCouponsAnalytics = async (req, res) => {
    try {
        // Extract user ID safely
        const userId = req?.user?.id;
        if (!userId) {
            return res?.status ? res.status(401).json({
                success: false,
                message: "User not authenticated"
            }) : { success: false, message: "User not authenticated" };
        }

        const { fromDate, toDate, period = 'all-time' } = req?.query || {};

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && period !== 'all-time' && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

        const analytics = await Coupon.aggregate([
            {
                $match: {
                    ownerId: new mongoose.Types.ObjectId(userId),
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalCoupons: { $sum: 1 },
                    activeCoupons: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$validTill", new Date()] },
                                        { $lt: ["$currentDistributions", "$maxDistributions"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    expiredCoupons: {
                        $sum: {
                            $cond: [
                                { $lt: ["$validTill", new Date()] },
                                1,
                                0
                            ]
                        }
                    },
                    fullyRedeemed: {
                        $sum: {
                            $cond: [
                                { $gte: ["$currentDistributions", "$maxDistributions"] },
                                1,
                                0
                            ]
                        }
                    },
                    totalDistributions: { $sum: "$maxDistributions" },
                    usedDistributions: { $sum: "$currentDistributions" },
                    avgDiscount: { $avg: { $toDouble: "$discountPercentage" } },
                    totalPotentialRevenue: {
                        $sum: {
                            $multiply: [
                                "$maxDistributions",
                                100 // Assuming ₹100 base value per coupon
                            ]
                        }
                    },
                    totalActualRevenue: {
                        $sum: {
                            $multiply: [
                                "$currentDistributions",
                                100,
                                { $divide: [{ $toDouble: "$discountPercentage" }, 100] }
                            ]
                        }
                    }
                }
            }
        ]);

        const couponStatus = await Coupon.aggregate([
            {
                $match: {
                    ownerId: new mongoose.Types.ObjectId(userId),
                    ...dateFilter
                }
            },
            {
                $project: {
                    status: {
                        $cond: [
                            { $lt: ["$validTill", new Date()] },
                            "Expired",
                            {
                                $cond: [
                                    { $gte: ["$currentDistributions", "$maxDistributions"] },
                                    "Fully Redeemed",
                                    {
                                        $cond: [
                                            { $gt: ["$currentDistributions", 0] },
                                            "Partially Redeemed",
                                            "Active"
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        const data = analytics[0] || {};
        const statusDistribution = couponStatus.reduce((acc, curr) => {
            if (curr?._id && curr?.count) {
                acc[curr._id] = curr.count;
            }
            return acc;
        }, {});

        const response = {
            success: true,
            data: {
                overview: {
                    totalCoupons: data.totalCoupons || 0,
                    activeCoupons: data.activeCoupons || 0,
                    expiredCoupons: data.expiredCoupons || 0,
                    fullyRedeemed: data.fullyRedeemed || 0,
                    totalDistributions: data.totalDistributions || 0,
                    usedDistributions: data.usedDistributions || 0,
                    remainingDistributions: Math.max(0, (data.totalDistributions || 0) - (data.usedDistributions || 0)),
                    avgDiscount: formatCurrency(data.avgDiscount || 0),
                    utilizationRate: calculateRedeemRate(data.usedDistributions || 0, data.totalDistributions || 0),
                    totalPotentialRevenue: formatCurrency(data.totalPotentialRevenue || 0),
                    totalActualRevenue: formatCurrency(data.totalActualRevenue || 0),
                    revenueEfficiency: calculateRedeemRate(data.totalActualRevenue || 0, data.totalPotentialRevenue || 0)
                },
                statusDistribution,
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    period,
                    dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
                }
            }
        };

        // Return based on context
        if (res?.status) {
            return res.status(200).json(response);
        } else {
            return response;
        }

    } catch (error) {
        console.error("Coupons analytics error:", error);

        const errorResponse = {
            success: false,
            message: "Error fetching coupons analytics",
            error: error.message
        };

        if (res?.status) {
            return res.status(500).json(errorResponse);
        } else {
            return errorResponse;
        }
    }
};
// ==============================
// PREMIUM PDF EXPORT CONTROLLER
// ==============================



export const exportDashboardPDF = async (req, res) => {
    req.socket.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    try {
        const userId = req.user.id;
        const { fromDate, toDate, period = 'all-time' } = req.query;

        // Prepare mock request for analytics functions
        const mockReq = {
            user: { id: userId },
            query: { fromDate, toDate, period }
        };

        // Parallel fetch of all report data
        const [partnerProfile, statsRes, salesRes, couponsRes] = await Promise.all([
            PatnerProfile.findOne({ User_id: userId }),
            getDashboardStats(mockReq),
            getSalesAnalytics(mockReq),
            getCouponsAnalytics(mockReq)
        ]);

        if (!statsRes.success || !salesRes.success || !couponsRes.success) {
            throw new Error('Failed to fetch data for PDF generation');
        }

        const stats = statsRes.data;
        const salesData = salesRes.data;
        const couponsData = couponsRes.data;

        // Initialize the PDF
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true,
            info: {
                Title: `${stats.partnerInfo.firmName} - Performance Analytics Report`,
                Author: 'Partner Analytics Dashboard',
                CreationDate: new Date(),
                Subject: 'Comprehensive Business Performance Analysis'
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${stats.partnerInfo.firmName.replace(/[^a-zA-Z0-9]/g, '_')}_Analytics_Report_${new Date().toISOString().slice(0, 10)}.pdf"`
        );

        doc.pipe(res);

        // 🎨 Brand Colors
        const colors = {
            primary: '#1A237E',
            secondary: '#3949AB',
            accent: '#64B5F6',
            text: '#2C3E50',
            light: '#F4F6F8',
            border: '#E0E0E0'
        };

        // 📘 Add Header
        const addHeader = () => {
            doc.rect(0, 0, doc.page.width, 100)
                .fill(colors.primary);

            doc.fillColor('#ffffff')
                .font('Helvetica-Bold')
                .fontSize(22)
                .text(stats.partnerInfo.firmName, 50, 35);

            doc.font('Helvetica')
                .fontSize(12)
                .text('Business Performance Analytics Report', 50, 65);

            doc.fillColor('#E3F2FD')
                .fontSize(10)
                .text(`Generated: ${new Date().toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                })}`, 400, 65, { align: 'right' });

            doc.moveDown(3);
        };

        // 📗 Section Header
        const addSectionHeader = (title) => {
            doc.moveDown(1);
            doc.fillColor(colors.primary)
                .font('Helvetica-Bold')
                .fontSize(16)
                .text(title);

            doc.moveTo(50, doc.y + 3)
                .lineTo(doc.page.width - 50, doc.y + 3)
                .strokeColor(colors.secondary)
                .lineWidth(1)
                .stroke();
            doc.moveDown(1.5);
        };

        // 🧭 Metric Card (Grid layout)
        const addMetricCard = (x, y, title, value, subtext) => {
            const width = 230, height = 70;
            doc.rect(x, y, width, height)
                .fillColor(colors.light)
                .strokeColor(colors.border)
                .lineWidth(1)
                .fillAndStroke();

            doc.fillColor(colors.primary)
                .font('Helvetica-Bold')
                .fontSize(14)
                .text(value, x + 10, y + 15);

            doc.fillColor(colors.text)
                .font('Helvetica')
                .fontSize(10)
                .text(title, x + 10, y + 35);

            if (subtext)
                doc.fillColor(colors.accent)
                    .fontSize(9)
                    .text(subtext, x + 10, y + 50);
        };

        // 📊 Table Generator
        const addTable = (headers, rows) => {
            const startX = 50;
            let y = doc.y + 10;
            const columnWidth = (doc.page.width - 100) / headers.length;

            // Header row
            doc.fillColor(colors.primary)
                .font('Helvetica-Bold')
                .fontSize(10);
            headers.forEach((h, i) =>
                doc.text(h, startX + i * columnWidth, y, { width: columnWidth, align: 'left' })
            );

            y += 18;
            doc.moveTo(startX, y - 5).lineTo(doc.page.width - 50, y - 5).strokeColor(colors.border).stroke();

            // Rows
            doc.fillColor(colors.text).font('Helvetica').fontSize(9);
            rows.forEach((row, idx) => {
                if (y > 700) { doc.addPage(); addHeader(); addSectionHeader('Continued...'); y = 150; }

                headers.forEach((h, i) => {
                    doc.text(row[h] || '', startX + i * columnWidth, y, { width: columnWidth, align: 'left' });
                });
                y += 15;

                doc.moveTo(startX, y - 3)
                    .lineTo(doc.page.width - 50, y - 3)
                    .strokeColor(colors.border)
                    .lineWidth(0.3)
                    .stroke();
            });
            doc.moveDown(2);
        };

        // Add main header
        addHeader();

        // 🧩 EXECUTIVE SUMMARY
        addSectionHeader('Executive Summary');

        const metrics = [
            {
                title: 'Total Revenue',
                value: `₹${stats.overview.totalFinalAmount}`,
                sub: `${stats.overview.totalSales} sales`
            },
            {
                title: 'Total Discount',
                value: `₹${stats.overview.totalDiscount}`,
                sub: `${stats.overview.totalDiscountRate || 0}% of total`
            },
            {
                title: 'Active Coupons',
                value: stats.overview.activeCoupons,
                sub: `${stats.overview.totalCoupons} total`
            },
            {
                title: 'Redeem Rate',
                value: `${stats.overview.redeemRate}%`,
                sub: `${stats.overview.totalCurrentDistributions}/${stats.overview.totalMaxDistributions}`
            }
        ];

        // 2x2 Grid layout
        let y = doc.y;
        metrics.forEach((m, i) => {
            const x = 50 + (i % 2) * 250;
            const rowY = y + Math.floor(i / 2) * 85;
            addMetricCard(x, rowY, m.title, m.value, m.sub);
        });

        doc.y = y + 190;

        // 📈 SALES PERFORMANCE
        addSectionHeader('Sales Performance');
        addTable(
            ['Date', 'Transactions', 'Revenue', 'Discount', 'Avg. Order'],
            salesData.analytics.slice(0, 10).map(item => ({
                'Date': item.label,
                'Transactions': item.totalSales,
                'Revenue': `₹${item.totalFinalAmount}`,
                'Discount': `₹${item.totalDiscount}`,
                'Avg. Order': `₹${item.averageOrderValue}`
            }))
        );

        // 🎟️ COUPON PERFORMANCE
        addSectionHeader('Coupon Performance');
        addTable(
            ['Coupon', 'Distributed', 'Used', 'Utilization', 'Status'],
            stats.topCoupons.map(coupon => ({
                'Coupon': coupon.title,
                'Distributed': coupon.maxDistributions,
                'Used': coupon.currentDistributions,
                'Utilization': `${coupon.utilizationRate.toFixed(1)}%`,
                'Status': coupon.utilizationRate > 80 ? 'High' : coupon.utilizationRate > 50 ? 'Medium' : 'Low'
            }))
        );

        // 🧠 PERFORMANCE INSIGHTS
        addSectionHeader('Performance Insights');
        const insights = [
            `• Total Revenue Generated: ₹${stats.overview.totalFinalAmount}`,
            `• Completed Transactions: ${stats.overview.totalSales}`,
            `• Discount Given: ₹${stats.overview.totalDiscount}`,
            `• Active Campaigns: ${stats.overview.activeCoupons}`,
            `• Coupon Redemption Rate: ${stats.overview.redeemRate}%`
        ];

        insights.forEach(i => {
            doc.fillColor(colors.text)
                .fontSize(10)
                .text(i, { lineGap: 3 });
        });

        // Footer for each page
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            doc.fillColor('#9E9E9E')
                .fontSize(8)
                .text(
                    `Page ${i + 1} of ${totalPages}`,
                    50,
                    doc.page.height - 30,
                    { align: 'center' }
                );
            doc.text(
                `Confidential - ${stats.partnerInfo.firmName}`,
                50,
                doc.page.height - 20,
                { align: 'center' }
            );
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


// ==============================
// ENHANCED USER COUPONS ANALYTICS
// ==============================

export const getUserCouponsAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period = 'all-time' } = req.query;

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && period !== 'all-time' && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

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
                    uniqueUsers: { $addToSet: "$userId" },
                    totalValue: {
                        $sum: {
                            $multiply: [
                                "$count",
                                100, // Base value
                                { $divide: [{ $toDouble: "$couponInfo.discountPercentage" }, 100] }
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    status: "$_id",
                    count: 1,
                    uniqueUsers: { $size: "$uniqueUsers" },
                    totalValue: 1,
                    averageValue: { $divide: ["$totalValue", "$count"] }
                }
            }
        ]);

        // Get timeline data for user coupon usage
        const timelineData = await UserCoupon.aggregate([
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
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    used: {
                        $sum: { $cond: [{ $eq: ["$status", "used"] }, 1, 0] }
                    },
                    available: {
                        $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] }
                    },
                    transferred: {
                        $sum: { $cond: [{ $eq: ["$status", "transferred"] }, 1, 0] }
                    }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                statusBreakdown: analytics,
                timeline: timelineData,
                summary: {
                    totalUserCoupons: analytics.reduce((sum, item) => sum + item.count, 0),
                    uniqueUsers: analytics.reduce((sum, item) => sum + item.uniqueUsers, 0),
                    totalValue: formatCurrency(analytics.reduce((sum, item) => sum + item.totalValue, 0)),
                    usageRate: calculateRedeemRate(
                        analytics.find(item => item.status === 'used')?.count || 0,
                        analytics.reduce((sum, item) => sum + item.count, 0)
                    )
                },
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    period,
                    dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
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