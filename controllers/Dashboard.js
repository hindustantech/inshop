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
// ENHANCED DASHBOARD STATISTICS CONTROLLER
// ==============================

export const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period = 'all-time' } = req.query;

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

            // Sales statistics
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
                        avgTransactionValue: { $avg: "$finalAmount" }
                    }
                }
            ]),

            // User coupon statistics
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

        // Extract values with fallbacks
        const couponData = couponStats[0] || {};
        const salesData = salesStats[0] || {};
        const userCouponData = userCouponStats || [];

        const totalAmount = formatCurrency(salesData.totalAmount);
        const totalDiscount = formatCurrency(salesData.totalDiscount);
        const totalFinalAmount = formatCurrency(salesData.totalFinalAmount);
        const totalMaxDistributions = couponData.totalMaxDistributions || 0;
        const totalCurrentDistributions = couponData.totalCurrentDistributions || 0;
        const avgDiscountPercentage = formatCurrency(couponData.avgDiscountPercentage);
        const totalSales = salesData.totalSales || 0;
        const totalCoupons = couponData.totalCoupons || 0;
        const activeCoupons = couponData.activeCoupons || 0;

        // Calculate user coupon status counts
        const usedCoupons = userCouponData.find(item => item._id === 'used')?.count || 0;
        const availableCoupons = userCouponData.find(item => item._id === 'available')?.count || 0;

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
                    avgTransactionValue: formatCurrency(salesData.avgTransactionValue),

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
                    transferredCoupons: userCouponData.find(item => item._id === 'transferred')?.count || 0
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
// ENHANCED SALES ANALYTICS CONTROLLER
// ==============================

export const getSalesAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period = 'all-time', groupBy = 'day' } = req.query;

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && period !== 'all-time' && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

        let groupFormat;
        let dateFormat;

        switch (groupBy) {
            case 'hour':
                groupFormat = {
                    hour: { $hour: "$createdAt" },
                    day: { $dayOfMonth: "$createdAt" },
                    month: { $month: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
                dateFormat = "%Y-%m-%d %H:00";
                break;
            case 'week':
                groupFormat = {
                    week: { $week: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
                dateFormat = "Week %U, %Y";
                break;
            case 'month':
                groupFormat = {
                    month: { $month: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
                dateFormat = "%B %Y";
                break;
            default: // day
                groupFormat = {
                    day: { $dayOfMonth: "$createdAt" },
                    month: { $month: "$createdAt" },
                    year: { $year: "$createdAt" }
                };
                dateFormat = "%Y-%m-%d";
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
                totalAmount: formatCurrency(item.totalAmount),
                totalDiscount: formatCurrency(item.totalDiscount),
                totalFinalAmount: formatCurrency(item.totalFinalAmount),
                averageOrderValue: formatCurrency(item.averageOrderValue)
            };
        });

        // Calculate summary statistics
        const summary = formattedAnalytics.reduce((acc, curr) => ({
            totalRevenue: acc.totalRevenue + curr.totalFinalAmount,
            totalDiscount: acc.totalDiscount + curr.totalDiscount,
            totalTransactions: acc.totalTransactions + curr.totalSales,
            periodCount: acc.periodCount + 1
        }), { totalRevenue: 0, totalDiscount: 0, totalTransactions: 0, periodCount: 0 });

        res.status(200).json({
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

export const getCouponsAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period = 'all-time' } = req.query;

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
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        res.status(200).json({
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
                    avgDiscount: formatCurrency(data.avgDiscount),
                    utilizationRate: calculateRedeemRate(data.usedDistributions, data.totalDistributions),
                    totalPotentialRevenue: formatCurrency(data.totalPotentialRevenue),
                    totalActualRevenue: formatCurrency(data.totalActualRevenue),
                    revenueEfficiency: calculateRedeemRate(data.totalActualRevenue, data.totalPotentialRevenue)
                },
                statusDistribution,
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    period,
                    dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
                }
            }
        });

    } catch (error) {
        console.error("Coupons analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching coupons analytics",
            error: error.message
        });
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

        // Fetch all data in parallel
        const [partnerProfile, statsRes, salesRes, couponsRes] = await Promise.all([
            PatnerProfile.findOne({ User_id: userId }),
            getDashboardStats({ user: { id: userId }, query: { fromDate, toDate, period } }),
            getSalesAnalytics({ user: { id: userId }, query: { fromDate, toDate, period, groupBy: 'day' } }),
            getCouponsAnalytics({ user: { id: userId }, query: { fromDate, toDate, period } })
        ]);

        const stats = statsRes.data;
        const salesData = salesRes.data;
        const couponsData = couponsRes.data;

        // Create PDF document with professional styling
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
        res.setHeader('Content-Disposition',
            `attachment; filename="${stats.partnerInfo.firmName.replace(/[^a-zA-Z0-9]/g, '_')}_Analytics_Report_${new Date().toISOString().slice(0, 10)}.pdf"`
        );

        doc.pipe(res);

        // Colors for professional design
        const colors = {
            primary: '#2c3e50',
            secondary: '#3498db',
            success: '#27ae60',
            warning: '#f39c12',
            danger: '#e74c3c',
            light: '#ecf0f1',
            dark: '#34495e'
        };

        // Helper functions for PDF generation
        const addHeader = () => {
            // Company Header with background
            doc.rect(0, 0, doc.page.width, 120)
                .fill(colors.primary);

            // Company Logo and Name
            doc.fillColor('#ffffff')
                .fontSize(24)
                .font('Helvetica-Bold')
                .text(stats.partnerInfo.firmName, 50, 40, { align: 'left' });

            doc.fontSize(12)
                .font('Helvetica')
                .text('Performance Analytics Report', 50, 70);

            // Report Period
            doc.fontSize(10)
                .text(`Period: ${stats.filters.dateRangeLabel}`, 50, 90);

            // Report Date
            doc.text(`Generated: ${new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}`, 50, 105);

            doc.y = 140;
        };

        const addSectionHeader = (title, y) => {
            doc.y = y || doc.y + 20;
            doc.fillColor(colors.primary)
                .fontSize(16)
                .font('Helvetica-Bold')
                .text(title, 50, doc.y);

            // Underline
            doc.moveTo(50, doc.y + 5)
                .lineTo(doc.page.width - 50, doc.y + 5)
                .strokeColor(colors.secondary)
                .lineWidth(1)
                .stroke();

            doc.y += 15;
        };

        const addMetricCard = (label, value, subtext, x, y, width = 120, height = 60) => {
            // Card background
            doc.rect(x, y, width, height)
                .fillColor(colors.light)
                .fill();

            // Border
            doc.rect(x, y, width, height)
                .strokeColor(colors.dark)
                .lineWidth(0.5)
                .stroke();

            // Value
            doc.fillColor(colors.primary)
                .fontSize(14)
                .font('Helvetica-Bold')
                .text(value, x + 10, y + 10, { width: width - 20, align: 'center' });

            // Label
            doc.fillColor(colors.dark)
                .fontSize(10)
                .font('Helvetica')
                .text(label, x + 10, y + 30, { width: width - 20, align: 'center' });

            // Subtext
            if (subtext) {
                doc.fillColor(colors.secondary)
                    .fontSize(8)
                    .text(subtext, x + 10, y + 45, { width: width - 20, align: 'center' });
            }
        };

        const addTable = (headers, rows, startY) => {
            let y = startY;
            const columnWidth = (doc.page.width - 100) / headers.length;

            // Table header
            doc.fillColor(colors.primary)
                .fontSize(10)
                .font('Helvetica-Bold');

            headers.forEach((header, i) => {
                doc.text(header, 50 + (i * columnWidth), y, {
                    width: columnWidth - 10,
                    align: 'left'
                });
            });

            y += 15;

            // Table rows
            doc.fillColor(colors.dark)
                .fontSize(9)
                .font('Helvetica');

            rows.forEach((row, rowIndex) => {
                headers.forEach((header, colIndex) => {
                    const cellValue = row[header] || row[colIndex] || '';
                    doc.text(cellValue.toString(), 50 + (colIndex * columnWidth), y, {
                        width: columnWidth - 10,
                        align: 'left'
                    });
                });
                y += 12;

                // Add row separator
                if (rowIndex < rows.length - 1) {
                    doc.moveTo(50, y - 3)
                        .lineTo(doc.page.width - 50, y - 3)
                        .strokeColor('#bdc3c7')
                        .lineWidth(0.3)
                        .stroke();
                }
            });

            return y + 10;
        };

        // Generate PDF Content
        addHeader();

        // Executive Summary Section
        addSectionHeader('Executive Summary');

        // Key Metrics in a grid
        const metrics = [
            { label: 'Total Revenue', value: `₹${stats.overview.totalFinalAmount}`, subtext: `${stats.overview.totalSales} sales` },
            { label: 'Total Discount', value: `₹${stats.overview.totalDiscount}`, subtext: `${calculateRedeemRate(stats.overview.totalDiscount, stats.overview.totalAmount)}% of revenue` },
            { label: 'Active Coupons', value: stats.overview.activeCoupons, subtext: `${calculateRedeemRate(stats.overview.activeCoupons, stats.overview.totalCoupons)}% of total` },
            { label: 'Redeem Rate', value: `${stats.overview.redeemRate}%`, subtext: `${stats.overview.totalCurrentDistributions}/${stats.overview.totalMaxDistributions} used` }
        ];

        metrics.forEach((metric, index) => {
            const row = Math.floor(index / 2);
            const col = index % 2;
            const x = 50 + (col * 270);
            const y = doc.y + (row * 80);
            addMetricCard(metric.label, metric.value, metric.subtext, x, y);
        });

        doc.y += 120;

        // Sales Performance Section
        if (doc.y > 600) {
            doc.addPage();
            doc.y = 50;
        }

        addSectionHeader('Sales Performance');

        const salesHeaders = ['Date', 'Transactions', 'Revenue', 'Discount', 'Avg. Order'];
        const salesRows = salesData.analytics.slice(0, 10).map(item => ({
            'Date': item.label,
            'Transactions': item.totalSales.toString(),
            'Revenue': `₹${item.totalFinalAmount}`,
            'Discount': `₹${item.totalDiscount}`,
            'Avg. Order': `₹${item.averageOrderValue}`
        }));

        doc.y = addTable(salesHeaders, salesRows, doc.y);

        // Coupon Performance Section
        if (doc.y > 500) {
            doc.addPage();
            doc.y = 50;
        }

        addSectionHeader('Coupon Performance');

        const couponHeaders = ['Coupon', 'Distributed', 'Used', 'Utilization', 'Status'];
        const couponRows = stats.topCoupons.map(coupon => ({
            'Coupon': coupon.title,
            'Distributed': coupon.maxDistributions.toString(),
            'Used': coupon.currentDistributions.toString(),
            'Utilization': `${coupon.utilizationRate.toFixed(1)}%`,
            'Status': coupon.utilizationRate > 80 ? 'High' : coupon.utilizationRate > 50 ? 'Medium' : 'Low'
        }));

        doc.y = addTable(couponHeaders, couponRows, doc.y);

        // Performance Insights Section
        if (doc.y > 400) {
            doc.addPage();
            doc.y = 50;
        }

        addSectionHeader('Performance Insights');

        const insights = [
            `• Revenue Generation: ₹${stats.overview.totalFinalAmount} with ${stats.overview.totalSales} completed transactions`,
            `• Coupon Efficiency: ${stats.overview.redeemRate}% redemption rate across all campaigns`,
            `• Discount Impact: ₹${stats.overview.totalDiscount} in customer savings`,
            `• Campaign Performance: ${stats.overview.activeCoupons} active campaigns driving engagement`,
            `• Customer Value: Average transaction value of ₹${stats.overview.avgTransactionValue || '0'}`
        ];

        insights.forEach(insight => {
            doc.fillColor(colors.dark)
                .fontSize(10)
                .font('Helvetica')
                .text(insight, 50, doc.y, {
                    width: doc.page.width - 100,
                    lineGap: 3
                });
            doc.y += 15;
        });

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);

            // Page number
            doc.fillColor(colors.dark)
                .fontSize(8)
                .text(
                    `Page ${i + 1} of ${pageCount}`,
                    50,
                    doc.page.height - 30,
                    { align: 'center' }
                );

            // Confidential footer
            doc.text(
                `Confidential - ${stats.partnerInfo.firmName} Analytics Report`,
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