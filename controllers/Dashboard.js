import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
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
// DASHBOARD STATISTICS CONTROLLER
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

        // Base match conditions
        const salesMatch = {
            userId: new mongoose.Types.ObjectId(userId),
            status: "completed",
            ...dateFilter
        };

        const couponMatch = {
            ownerId: new mongoose.Types.ObjectId(userId),
            ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {})
        };

        // Execute parallel queries for better performance
        const [totalStats, couponStats, salesByCoupon] = await Promise.all([
            // Total sales statistics
            Sales.aggregate([
                { $match: salesMatch },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" },
                        totalSales: { $sum: 1 }
                    }
                }
            ]),

            // Coupon statistics using maxDistributions and currentDistributions
            Coupon.aggregate([
                { $match: couponMatch },
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

            // Sales grouped by coupon for average discount calculation
            Sales.aggregate([
                { $match: salesMatch },
                {
                    $group: {
                        _id: "$couponId",
                        totalDiscount: { $sum: "$discountAmount" },
                        salesCount: { $sum: 1 }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalDiscountAmount: { $sum: "$totalDiscount" },
                        totalCouponsUsed: { $sum: "$salesCount" },
                        avgDiscountPerCoupon: { $avg: "$totalDiscount" }
                    }
                }
            ])
        ]);

        // Extract values with fallbacks
        const totalAmount = formatCurrency(totalStats[0]?.totalAmount || 0);
        const totalDiscount = formatCurrency(totalStats[0]?.totalDiscount || salesByCoupon[0]?.totalDiscountAmount || 0);
        const totalMaxDistributions = couponStats[0]?.totalMaxDistributions || 0;
        const totalCurrentDistributions = couponStats[0]?.totalCurrentDistributions || 0;
        const avgDiscountPercentage = formatCurrency(couponStats[0]?.avgDiscountPercentage || 0);
        const avgDiscountPerCouponValue = formatCurrency(salesByCoupon[0]?.avgDiscountPerCoupon || 0);
        const totalCouponsUsed = salesByCoupon[0]?.totalCouponsUsed || 0;
        const totalSales = totalStats[0]?.totalSales || 0;
        const totalCoupons = couponStats[0]?.totalCoupons || 0;

        const redeemRate = calculateRedeemRate(totalCurrentDistributions, totalMaxDistributions);

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
                    totalCoupons,
                    totalMaxDistributions,
                    totalCurrentDistributions,
                    remainingDistributions: totalMaxDistributions - totalCurrentDistributions,
                    avgDiscountPercentage,
                    avgDiscountPerCoupon: avgDiscountPerCouponValue,
                    redeemRate: formatCurrency(redeemRate),
                    totalSales,
                    totalCouponsUsed
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
// COUPONS LIST CONTROLLER
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
        const [coupons, totalCoupons] = await Promise.all([
            Coupon.find(baseFilter)
                .select('title validTill discountPercentage maxDistributions currentDistributions shop_name copuon_srno createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Coupon.countDocuments(baseFilter)
        ]);

        // Format coupon data
        const formattedCoupons = coupons.map(coupon => {
            const baseAmount = coupon.maxDistributions * 100; // Assuming 100 per distribution
            const discountPercentage = parseFloat(coupon.discountPercentage) || 0;
            const discountAmount = (baseAmount * discountPercentage) / 100;

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
// SALES ANALYTICS CONTROLLER
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
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    status: "completed",
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: groupFormat,
                    totalAmount: { $sum: "$amount" },
                    totalDiscount: { $sum: "$discountAmount" },
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
// ENHANCED PDF EXPORT CONTROLLER
// ==============================

export const exportDashboardPDF = async (req, res) => {
    // Set timeout for large reports
    req.socket.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;

        // Fetch all data in parallel
        const [partnerProfile, statsRes, couponsRes, analyticsRes] = await Promise.all([
            PatnerProfile.findOne({ User_id: userId }),
            getDashboardStats({ user: { id: userId }, query: { fromDate, toDate, period } }),
            getCouponsList({ user: { id: userId }, query: { fromDate, toDate, limit: 100 } }),
            getSalesAnalytics({ user: { id: userId }, query: { fromDate, toDate, groupBy: 'day' } }).catch(() => ({ data: { analytics: [] } }))
        ]);

        const stats = statsRes.data;
        const allCoupons = couponsRes.data.coupons;
        const analytics = analyticsRes.data.analytics || [];

        // Sort coupons by performance (most distributions first)
        const topCoupons = [...allCoupons]
            .sort((a, b) => b.currentDistributions - a.currentDistributions)
            .slice(0, 30);

        // Create PDF document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true,
            info: {
                Title: `${stats.partnerInfo.firmName} - Performance Report`,
                Author: 'Partner Dashboard',
                CreationDate: new Date()
            }
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `attachment; filename="${stats.partnerInfo.firmName.replace(/[^a-zA-Z0-9]/g, '_')}_Report_${new Date().toISOString().slice(0, 10)}.pdf"`
        );

        doc.pipe(res);

        // Colors and styling
        const primaryColor = '#1a365d';
        const accentColor = '#3182ce';
        const successColor = '#48bb78';
        const warningColor = '#ed8936';
        const dangerColor = '#f56565';

        // Font setup
        const bold = 'Helvetica-Bold';
        const regular = 'Helvetica';

        // ===== HEADER SECTION =====
        doc.fillColor(primaryColor)
            .fontSize(20)
            .font(bold)
            .text(stats.partnerInfo.firmName, { align: 'center' });

        if (stats.partnerInfo.city || stats.partnerInfo.state) {
            doc.fontSize(12)
                .font(regular)
                .text(`${stats.partnerInfo.city}${stats.partnerInfo.city && stats.partnerInfo.state ? ', ' : ''}${stats.partnerInfo.state}`,
                    { align: 'center' });
        }

        doc.fontSize(16)
            .text('Coupon Performance Report', { align: 'center', underline: true })
            .moveDown(1.5);

        // ===== REPORT PERIOD INFO =====
        const periodText = period
            ? period.charAt(0).toUpperCase() + period.slice(1)
            : fromDate && toDate
                ? `${new Date(fromDate).toLocaleDateString()} - ${new Date(toDate).toLocaleDateString()}`
                : "All Time";

        doc.fontSize(10)
            .fillColor('#4a5568')
            .text(`Report Period: ${periodText}`, 50, doc.y)
            .text(`Generated: ${new Date().toLocaleString()}`, 50, doc.y + 15)
            .text(`Total Coupons: ${stats.overview.totalCoupons.toLocaleString()}`, 50, doc.y + 30)
            .text(`Total Distributions: ${stats.overview.totalMaxDistributions.toLocaleString()}`, 50, doc.y + 45)
            .text(`Used Distributions: ${stats.overview.totalCurrentDistributions.toLocaleString()}`, 50, doc.y + 60);

        doc.moveDown(4);

        // ===== KEY METRICS SECTION =====
        const metrics = [
            {
                label: "Total Revenue",
                value: `₹${stats.overview.totalAmount.toLocaleString()}`,
                color: successColor
            },
            {
                label: "Total Discount",
                value: `₹${stats.overview.totalDiscount.toLocaleString()}`,
                color: warningColor
            },
            {
                label: "Total Distributions",
                value: stats.overview.totalMaxDistributions.toLocaleString(),
                color: accentColor
            },
            {
                label: "Redeem Rate",
                value: `${stats.overview.redeemRate}%`,
                color: primaryColor
            },
        ];

        const boxWidth = 120;
        const boxHeight = 60;
        const startY = doc.y;

        metrics.forEach((metric, index) => {
            const row = Math.floor(index / 2);
            const col = index % 2;
            const x = 50 + col * (boxWidth + 30);
            const y = startY + row * (boxHeight + 20);

            // Metric box
            doc.rect(x, y, boxWidth, boxHeight)
                .fill(metric.color)
                .stroke();

            // Metric value
            doc.fillColor('white')
                .font(bold)
                .fontSize(14)
                .text(metric.value, x + 10, y + 15, { width: boxWidth - 20, align: 'center' });

            // Metric label
            doc.font(regular)
                .fontSize(10)
                .text(metric.label, x + 10, y + 35, { width: boxWidth - 20, align: 'center' });
        });

        doc.moveDown(8);

        // ===== DISTRIBUTION SUMMARY =====
        doc.fillColor(primaryColor)
            .fontSize(14)
            .font(bold)
            .text('Distribution Summary', { underline: true })
            .moveDown(0.5);

        doc.fillColor('#4a5568')
            .fontSize(10)
            .font(regular)
            .text(`Total Available Distributions: ${stats.overview.totalMaxDistributions.toLocaleString()}`)
            .text(`Used Distributions: ${stats.overview.totalCurrentDistributions.toLocaleString()}`)
            .text(`Remaining Distributions: ${stats.overview.remainingDistributions.toLocaleString()}`)
            .text(`Utilization Rate: ${stats.overview.redeemRate}%`);

        doc.moveDown(2);

        // ===== TOP PERFORMING COUPONS SECTION =====
        if (topCoupons.length > 0) {
            doc.addPage();
            doc.fillColor(primaryColor)
                .fontSize(16)
                .font(bold)
                .text('Top Performing Coupons', { underline: true })
                .moveDown(1);

            topCoupons.forEach((coupon, index) => {
                // Check page bounds
                if (doc.y > 650) {
                    doc.addPage();
                    doc.fillColor(primaryColor)
                        .fontSize(16)
                        .font(bold)
                        .text('Top Performing Coupons (Continued)', { underline: true })
                        .moveDown(1);
                }

                const utilizationRate = coupon.maxDistributions > 0
                    ? ((coupon.currentDistributions / coupon.maxDistributions) * 100).toFixed(1)
                    : 0;

                // Coupon header
                doc.fillColor(accentColor)
                    .fontSize(12)
                    .font(bold)
                    .text(`${index + 1}. ${coupon.title}`);

                // Coupon details
                doc.fillColor('#2d3748')
                    .fontSize(10)
                    .font(regular)
                    .text(`   Serial: ${coupon.couponSerial} | Shop: ${coupon.shopName}`)
                    .text(`   Valid Until: ${new Date(coupon.validTill).toLocaleDateString()}`)
                    .text(`   Discount: ${coupon.discountPercentage}%`)
                    .text(`   Distributions: ${coupon.currentDistributions}/${coupon.maxDistributions} (${utilizationRate}%)`)
                    .text(`   Status: ${coupon.status}`, { indent: 20 })
                    .moveDown(0.8);
            });
        }

        // ===== SALES ANALYTICS SECTION =====
        if (analytics.length > 0) {
            doc.addPage();
            doc.fillColor(primaryColor)
                .fontSize(16)
                .font(bold)
                .text('Sales Analytics', { underline: true })
                .moveDown(1);

            // Table header
            doc.fillColor('#4a5568')
                .fontSize(10)
                .font(bold)
                .text('Date', 50, doc.y)
                .text('Sales', 200, doc.y)
                .text('Revenue', 280, doc.y)
                .text('Discount', 360, doc.y);

            doc.moveTo(50, doc.y + 5)
                .lineTo(500, doc.y + 5)
                .strokeColor('#e2e8f0')
                .stroke();

            doc.moveDown(0.5);

            // Table rows
            analytics.slice(-20).forEach(item => {
                if (doc.y > 700) {
                    doc.addPage();
                }

                const date = item._id.day
                    ? `${item._id.day}/${item._id.month}/${item._id.year}`
                    : item._id.week
                        ? `Week ${item._id.week}, ${item._id.year}`
                        : `${item._id.month}/${item._id.year}`;

                doc.fillColor('#2d3748')
                    .fontSize(9)
                    .font(regular)
                    .text(date, 50, doc.y)
                    .text(item.totalSales.toString(), 200, doc.y)
                    .text(`₹${formatCurrency(item.totalAmount)}`, 280, doc.y)
                    .text(`₹${formatCurrency(item.totalDiscount)}`, 360, doc.y)
                    .moveDown(0.8);
            });
        }

        // ===== FOOTER ON EVERY PAGE =====
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);

            // Page footer
            doc.fillColor('#a0aec0')
                .fontSize(8)
                .text(
                    `Page ${i + 1} of ${totalPages} • Generated by Partner Dashboard • ${new Date().toLocaleDateString()}`,
                    50,
                    doc.page.height - 30,
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