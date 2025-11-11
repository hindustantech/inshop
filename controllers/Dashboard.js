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
        filter.createdAt = { $gte: startDate, $lte: endDate };
    } else if (fromDate) {
        const startDate = new Date(fromDate);
        filter.createdAt = { $gte: startDate };
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
        case "today":
            startDate.setHours(0, 0, 0, 0);
            break;
        case "yesterday":
            startDate.setDate(startDate.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(endDate.getDate() - 1);
            endDate.setHours(23, 59, 59, 999);
            break;
        case "week":
            startDate.setDate(startDate.getDate() - 7);
            break;
        case "month":
            startDate.setMonth(startDate.getMonth() - 1);
            break;
        case "year":
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        default:
            return {};
    }

    return {
        createdAt: {
            $gte: startDate,
            $lte: endDate,
        },
    };
};

const formatCurrency = (amount) => parseFloat(amount?.toFixed(2) || 0);
const calculateRedeemRate = (used, total) =>
    total > 0 ? (used / total) * 100 : 0;

const getCouponStatus = (validTill, currentDistributions, maxDistributions) => {
    const isExpired = new Date(validTill) < new Date();
    const isFullyRedeemed = currentDistributions >= maxDistributions;

    if (isExpired) return "Expired";
    if (isFullyRedeemed) return "Fully Redeemed";
    if (currentDistributions > 0) return "Partially Redeemed";
    return "Active";
};

// ==============================
// DASHBOARD STATISTICS CONTROLLER (FIXED)
// ==============================

export const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;

        const partnerProfile = await PatnerProfile.findOne({ User_id: userId });

        // Build unified date filter
        let dateFilter = {};
        if (fromDate || toDate) dateFilter = buildDateFilter(fromDate, toDate);
        else if (period) dateFilter = buildPeriodFilter(period);

        const [couponStats, salesStats, userCouponStats] = await Promise.all([
            Coupon.aggregate([
                {
                    $match: {
                        ownerId: new mongoose.Types.ObjectId(userId),
                        ...dateFilter,
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalMaxDistributions: { $sum: "$maxDistributions" },
                        totalCurrentDistributions: { $sum: "$currentDistributions" },
                        avgDiscountPercentage: {
                            $avg: { $toDouble: "$discountPercentage" },
                        },
                        totalCoupons: { $sum: 1 },
                    },
                },
            ]),

            Sales.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo",
                    },
                },
                { $unwind: "$couponInfo" },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "completed",
                        ...dateFilter,
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" },
                        totalSales: { $sum: 1 },
                        totalFinalAmount: { $sum: "$finalAmount" },
                    },
                },
            ]),

            UserCoupon.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo",
                    },
                },
                { $unwind: "$couponInfo" },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "used",
                        ...dateFilter,
                    },
                },
                {
                    $group: { _id: null, totalUsedCoupons: { $sum: 1 } },
                },
            ]),
        ]);

        const totalAmount = formatCurrency(salesStats[0]?.totalAmount || 0);
        const totalDiscount = formatCurrency(salesStats[0]?.totalDiscount || 0);
        const totalFinalAmount = formatCurrency(
            salesStats[0]?.totalFinalAmount || 0
        );
        const totalMaxDistributions = couponStats[0]?.totalMaxDistributions || 0;
        const totalCurrentDistributions =
            couponStats[0]?.totalCurrentDistributions || 0;
        const avgDiscountPercentage = formatCurrency(
            couponStats[0]?.avgDiscountPercentage || 0
        );
        const totalSales = salesStats[0]?.totalSales || 0;
        const totalCoupons = couponStats[0]?.totalCoupons || 0;
        const totalUsedCoupons = userCouponStats[0]?.totalUsedCoupons || 0;

        const redeemRate = calculateRedeemRate(
            totalCurrentDistributions,
            totalMaxDistributions
        );
        const salesConversionRate = calculateRedeemRate(
            totalUsedCoupons,
            totalCurrentDistributions
        );

        res.status(200).json({
            success: true,
            data: {
                partnerInfo: {
                    firmName: partnerProfile?.firm_name || "Your Firm",
                    logo: partnerProfile?.logo || null,
                    city: partnerProfile?.address?.city || "",
                    state: partnerProfile?.address?.state || "",
                },
                filters: { fromDate, toDate, period: period || "all-time" },
                overview: {
                    totalAmount,
                    totalDiscount,
                    totalFinalAmount,
                    totalCoupons,
                    totalMaxDistributions,
                    totalCurrentDistributions,
                    totalUsedCoupons,
                    remainingDistributions:
                        totalMaxDistributions - totalCurrentDistributions,
                    avgDiscountPercentage,
                    redeemRate: formatCurrency(redeemRate),
                    salesConversionRate: formatCurrency(salesConversionRate),
                    totalSales,
                },
            },
        });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching dashboard statistics",
            error: error.message,
        });
    }
};

// ==============================
// COUPONS LIST CONTROLLER (FIXED DATE FILTER)
// ==============================

export const getCouponsList = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const { fromDate, toDate, status, search } = req.query;
        const skip = (page - 1) * limit;

        const dateFilter = buildDateFilter(fromDate, toDate);
        const now = new Date();

        let statusFilter = {};
        if (status === "active") {
            statusFilter = {
                validTill: { $gte: now },
                $expr: { $lt: ["$currentDistributions", "$maxDistributions"] },
            };
        } else if (status === "expired") {
            statusFilter.validTill = { $lt: now };
        } else if (status === "fully-redeemed") {
            statusFilter.$expr = {
                $eq: ["$currentDistributions", "$maxDistributions"],
            };
        } else if (status === "partially-redeemed") {
            statusFilter.$expr = {
                $and: [
                    { $gt: ["$currentDistributions", 0] },
                    { $lt: ["$currentDistributions", "$maxDistributions"] },
                ],
            };
        }

        let searchFilter = {};
        if (search) {
            searchFilter = {
                $or: [
                    { title: { $regex: search, $options: "i" } },
                    { shop_name: { $regex: search, $options: "i" } },
                    { copuon_srno: { $regex: search, $options: "i" } },
                ],
            };
        }

        const baseFilter = {
            ownerId: new mongoose.Types.ObjectId(userId),
            ...dateFilter,
            ...statusFilter,
            ...searchFilter,
        };

        const [coupons, totalCoupons, salesData] = await Promise.all([
            Coupon.find(baseFilter)
                .select(
                    "title validTill discountPercentage maxDistributions currentDistributions shop_name copuon_srno createdAt"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Coupon.countDocuments(baseFilter),

            Sales.aggregate([
                {
                    $lookup: {
                        from: "coupons",
                        localField: "couponId",
                        foreignField: "_id",
                        as: "couponInfo",
                    },
                },
                { $unwind: "$couponInfo" },
                {
                    $match: {
                        "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                        status: "completed",
                    },
                },
                {
                    $group: {
                        _id: "$couponId",
                        totalSales: { $sum: 1 },
                        totalRevenue: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" },
                    },
                },
            ]),
        ]);

        const salesMap = {};
        salesData.forEach((sale) => {
            salesMap[sale._id.toString()] = {
                totalSales: sale.totalSales,
                totalRevenue: sale.totalRevenue,
                totalDiscount: sale.totalDiscount,
            };
        });

        const formattedCoupons = coupons.map((coupon) => {
            const baseAmount = coupon.maxDistributions * 100;
            const discountPercentage = parseFloat(coupon.discountPercentage) || 0;
            const discountAmount = (baseAmount * discountPercentage) / 100;

            const couponSales = salesMap[coupon._id.toString()] || {
                totalSales: 0,
                totalRevenue: 0,
                totalDiscount: 0,
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
                remainingDistributions:
                    coupon.maxDistributions - coupon.currentDistributions,
                amount: baseAmount,
                discountAmount: formatCurrency(discountAmount),
                usedCount: coupon.currentDistributions,
                totalDistributed: coupon.maxDistributions,
                salesData: {
                    totalSales: couponSales.totalSales,
                    totalRevenue: formatCurrency(couponSales.totalRevenue),
                    totalDiscount: formatCurrency(couponSales.totalDiscount),
                },
                status,
                isExpired: new Date(coupon.validTill) < new Date(),
                isFullyRedeemed:
                    coupon.currentDistributions >= coupon.maxDistributions,
                createdAt: coupon.createdAt,
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
                    limit,
                },
                filters: { fromDate, toDate, status, search },
            },
        });
    } catch (error) {
        console.error("Coupons list error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching coupons list",
            error: error.message,
        });
    }
};

// ==============================
// SALES ANALYTICS CONTROLLER (FIXED)
// ==============================

export const getSalesAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, groupBy = "day" } = req.query;

        const dateFilter = buildDateFilter(fromDate, toDate);

        let groupFormat;
        switch (groupBy) {
            case "week":
                groupFormat = { week: { $week: "$createdAt" }, year: { $year: "$createdAt" } };
                break;
            case "month":
                groupFormat = { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
                break;
            default:
                groupFormat = {
                    day: { $dayOfMonth: "$createdAt" },
                    month: { $month: "$createdAt" },
                    year: { $year: "$createdAt" },
                };
        }

        const analytics = await Sales.aggregate([
            {
                $lookup: {
                    from: "coupons",
                    localField: "couponId",
                    foreignField: "_id",
                    as: "couponInfo",
                },
            },
            { $unwind: "$couponInfo" },
            {
                $match: {
                    "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                    status: "completed",
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: groupFormat,
                    totalAmount: { $sum: "$amount" },
                    totalDiscount: { $sum: "$discountAmount" },
                    totalFinalAmount: { $sum: "$finalAmount" },
                    totalSales: { $sum: 1 },
                    date: { $first: "$createdAt" },
                },
            },
            {
                $sort: {
                    "_id.year": 1,
                    "_id.month": 1,
                    "_id.day": 1,
                    "_id.week": 1,
                },
            },
        ]);

        res.status(200).json({
            success: true,
            data: { analytics, filters: { fromDate, toDate, groupBy } },
        });
    } catch (error) {
        console.error("Sales analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching sales analytics",
            error: error.message,
        });
    }
};

// ==============================
// USER COUPONS ANALYTICS (FIXED)
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
                    as: "couponInfo",
                },
            },
            { $unwind: "$couponInfo" },
            {
                $match: {
                    "couponInfo.ownerId": new mongoose.Types.ObjectId(userId),
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    coupons: { $push: "$couponId" },
                },
            },
        ]);

        res.status(200).json({
            success: true,
            data: { analytics, filters: { fromDate, toDate } },
        });
    } catch (error) {
        console.error("User coupons analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user coupons analytics",
            error: error.message,
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
            size: 'A4',
            margin: 50,
            bufferPages: true,
            info: {
                Title: `${stats.partnerInfo.firmName} - Performance Report`,
                Author: 'Partner Dashboard',
                CreationDate: new Date(),
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${stats.partnerInfo.firmName.replace(/[^a-zA-Z0-9]/g, '_')}_Report_${new Date().toISOString().slice(0, 10)}.pdf"`);

        doc.pipe(res);

        // ===== COLORS & FONTS =====
        const colors = {
            primary: '#1e40af',    // Deep blue
            secondary: '#0d9488',  // Teal
            success: '#16a34a',    // Green
            warning: '#ca8a04',    // Yellow
            danger: '#dc2626',     // Red
            light: '#f8fafc',
            gray: '#64748b',
            dark: '#1e293b',
            border: '#e2e8f0'
        };

        const font = {
            bold: 'Helvetica-Bold',
            regular: 'Helvetica',
            oblique: 'Helvetica-Oblique'
        };

        const formatINR = (amount) => `₹${formatCurrency(amount)}`;

        // ===== HELPER: Safe Text with Page Break Check =====
        const addText = (text, x, y, options = {}) => {
            if (doc.y > 750) doc.addPage();
            doc.text(text, x, y || doc.y, options);
        };

        // ===== COVER PAGE =====
        // Background gradient effect (simulated)
        doc.rect(0, 0, doc.page.width, 220).fill(colors.primary);
        doc.rect(0, 220, doc.page.width, 80).fill('#172554');

        // Logo (if exists)
        if (partnerProfile?.logo) {
            try {
                doc.image(partnerProfile.logo, 50, 60, { width: 80 });
            } catch (err) { /* ignore */ }
        }

        doc.fillColor('white')
            .fontSize(32)
            .font(font.bold)
            .text('Performance Report', 0, 100, { align: 'center' });

        doc.fontSize(18)
            .font(font.regular)
            .text(stats.partnerInfo.firmName, 0, 145, { align: 'center' });

        doc.fontSize(12)
            .text('Comprehensive Business Analytics', 0, 180, { align: 'center' });

        // Period Badge
        const periodText = period
            ? period.replace('-', ' ').toUpperCase()
            : fromDate && toDate
                ? `${new Date(fromDate).toLocaleDateString('en-IN')} – ${new Date(toDate).toLocaleDateString('en-IN')}`
                : 'ALL TIME';

        doc.fillColor(colors.secondary)
            .roundedRect(200, 260, 200, 50, 10)
            .fill();

        doc.fillColor('white')
            .fontSize(14)
            .font(font.bold)
            .text(periodText, 0, 280, { align: 'center' });

        doc.fillColor(colors.gray)
            .fontSize(10)
            .text(`Generated on ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 0, 350, { align: 'center' });

        doc.addPage();

        // ===== EXECUTIVE SUMMARY =====
        doc.fillColor(colors.primary)
            .fontSize(22)
            .font(font.bold)
            .text('Executive Summary', 50, 80);

        doc.fillColor(colors.dark)
            .fontSize(11)
            .font(font.regular)
            .text(`Firm: ${stats.partnerInfo.firmName}`, 50, 130)
            .text(`Location: ${stats.partnerInfo.city}${stats.partnerInfo.state ? ', ' + stats.partnerInfo.state : ''}`, 50, 150)
            .text(`Contact: ${stats.partnerInfo.contact || 'N/A'} | ${stats.partnerInfo.email || 'N/A'}`, 50, 170);

        // ===== KPI CARDS (3 per row) =====
        const kpis = [
            { label: 'Gross Revenue', value: formatINR(totalAmount), icon: '₹', color: colors.success },
            { label: 'Net Revenue', value: formatINR(totalFinalAmount), icon: '₹', color: colors.secondary },
            { label: 'Total Discounts', value: formatINR(totalDiscount), icon: '↓', color: colors.warning },
            { label: 'Total Sales', value: totalSales.toLocaleString(), icon: '✓', color: colors.primary },
            { label: 'Avg Transaction', value: formatINR(avgTransactionValue), icon: '⌀', color: colors.danger },
            { label: 'Redemption Rate', value: `${stats.overview.redeemRate}%`, icon: '↗', color: colors.success },
        ];

        let yPos = 220;
        kpis.forEach((kpi, i) => {
            const x = 50 + (i % 3) * 170;
            if (i % 3 === 0 && i !== 0) yPos += 110;

            // Card background
            doc.roundedRect(x, yPos, 160, 100, 12)
                .fill(i % 2 === 0 ? '#f0f9ff' : '#fefce8')
                .strokeColor(colors.border)
                .lineWidth(1)
                .stroke();

            // Icon circle
            doc.circle(x + 25, yPos + 25, 18)
                .fill(kpi.color);

            doc.fillColor('white')
                .fontSize(20)
                .font(font.bold)
                .text(kpi.icon, x + 15, yPos + 15, { width: 20, align: 'center' });

            // Value
            doc.fillColor(kpi.color)
                .fontSize(16)
                .font(font.bold)
                .text(kpi.value, x + 10, yPos + 50, { width: 140, align: 'center' });

            // Label
            doc.fillColor(colors.dark)
                .fontSize(10)
                .font(font.regular)
                .text(kpi.label, x + 10, yPos + 75, { width: 140, align: 'center' });
        });

        yPos += 140;

        // ===== TOP COUPONS TABLE =====
        if (topCoupons.length > 0) {
            if (yPos > 500) {
                doc.addPage();
                yPos = 80;
            } else {
                yPos += 40;
            }

            doc.fillColor(colors.primary)
                .fontSize(18)
                .font(font.bold)
                .text('Top Performing Coupons', 50, yPos);

            yPos += 40;

            // Table Header
            const headers = ['#', 'Coupon', 'Serial', 'Disc%', 'Used/Max', 'Revenue', 'Eff%', 'Status'];
            const colWidths = [30, 140, 80, 50, 80, 80, 50, 70];
            const startX = 50;

            doc.fillColor(colors.primary).rect(startX, yPos, 510, 25).fill();
            doc.fillColor('white').fontSize(9).font(font.bold);

            headers.forEach((h, i) => {
                doc.text(h, startX + 5 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), yPos + 8);
            });

            yPos += 25;

            topCoupons.forEach((c, idx) => {
                if (yPos > 750) {
                    doc.addPage();
                    yPos = 80;
                }

                if (idx % 2 === 0) {
                    doc.fillColor('#f8fafc').rect(startX, yPos, 510, 20).fill();
                }

                const row = [
                    (idx + 1).toString(),
                    c.title.length > 20 ? c.title.slice(0, 18) + '...' : c.title,
                    c.couponSerial,
                    c.discountPercentage + '%',
                    `${c.currentDistributions}/${c.maxDistributions}`,
                    formatINR(c.actualRevenue),
                    c.revenueEfficiency + '%',
                    c.status
                ];

                doc.fillColor(colors.dark).fontSize(8.5).font(font.regular);

                row.forEach((cell, i) => {
                    const x = startX + 5 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                    if (i === 7) {
                        const statusColor = c.status.includes('Active') ? colors.success : c.status.includes('Expired') ? colors.danger : colors.warning;
                        doc.fillColor(statusColor);
                    }
                    doc.text(cell, x, yPos + 6);
                });

                yPos += 20;
            });
        }

        // ===== SALES TIMELINE (Last 30 days) =====
        if (analytics.length > 0) {
            doc.addPage();
            doc.fillColor(colors.primary)
                .fontSize(18)
                .font(font.bold)
                .text('Sales Trend (Last 30 Days)', 50, 80);

            let tableY = 130;
            const data = analytics.slice(-30);

            // Header
            doc.fillColor(colors.primary).rect(50, tableY, 510, 25).fill();
            doc.fillColor('white').fontSize(9).font(font.bold)
                .text('Date', 55, tableY + 8)
                .text('Sales', 140, tableY + 8)
                .text('Gross', 200, tableY + 8)
                .text('Discount', 280, tableY + 8)
                .text('Net Revenue', 360, tableY + 8)
                .text('Growth', 480, tableY + 8);

            tableY += 25;

            let prev = 0;
            data.forEach((d, i) => {
                if (tableY > 750) {
                    doc.addPage();
                    tableY = 100;
                }

                if (i % 2 === 0) doc.fillColor('#fdfdfd').rect(50, tableY, 510, 18).fill();

                const growth = prev === 0 ? 0 : ((d.totalFinalAmount - prev) / prev * 100).toFixed(1);
                prev = d.totalFinalAmount;

                doc.fillColor(colors.dark).fontSize(8.5)
                    .text(d._id.date, 55, tableY + 5)
                    .text(d.totalSales.toString(), 145, tableY + 5)
                    .text(formatINR(d.totalAmount), 200, tableY + 5)
                    .text(formatINR(d.totalDiscount), 285, tableY + 5)
                    .text(formatINR(d.totalFinalAmount), 365, tableY + 5);

                doc.fillColor(growth >= 0 ? colors.success : colors.danger)
                    .text(growth >= 0 ? `+${growth}%` : `${growth}%`, 485, tableY + 5);

                tableY += 18;
            });
        }

        // ===== INSIGHTS PAGE =====
        doc.addPage();
        doc.fillColor(colors.primary)
            .fontSize(22)
            .font(font.bold)
            .text('Key Insights & Recommendations', 50, 100);

        const insights = [
            `• Generated ${formatINR(totalAmount)} in gross revenue with ${stats.overview.redeemRate}% coupon redemption rate.`,
            `• Provided ${formatINR(totalDiscount)} in discounts across ${totalSales} transactions.`,
            `• Served ${uniqueCustomers} unique customers with average order value of ${formatINR(avgTransactionValue)}.`,
            `• Top performing coupons contributed to ${topCoupons.length > 0 ? formatINR(topCoupons[0].actualRevenue) : 'N/A'} in revenue.`,
            `• Opportunity: Increase redemption rate by promoting underutilized coupons.`
        ];

        doc.fillColor(colors.dark)
            .fontSize(11)
            .font(font.oblique);

        insights.forEach((insight, i) => {
            doc.text(insight, 70, 160 + i * 30, { width: 470, align: 'left' });
        });

        // ===== FOOTER ON ALL PAGES =====
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fillColor(colors.gray)
                .fontSize(8)
                .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 50)
                .text('Confidential • Generated by Partner Dashboard', 0, doc.page.height - 50, { align: 'center' });

            doc.moveTo(50, doc.page.height - 60)
                .lineTo(doc.page.width - 50, doc.page.height - 60)
                .strokeColor(colors.border)
                .lineWidth(0.5)
                .stroke();
        }

        doc.end();

    } catch (error) {
        console.error("PDF export error:", error);

        // Check if headers are already sent before sending error response
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "Error generating PDF report",
                error: error.message
            });
        } else {
            // If headers are sent, we can't send JSON response, so log the error
            console.error("Headers already sent when error occurred:", error.message);
        }
    }
};