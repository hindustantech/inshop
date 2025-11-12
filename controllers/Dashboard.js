import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
import PatnerProfile from "../models/PatnerProfile.js";
import PDFDocument from 'pdfkit';
import mongoose from "mongoose";
import UserCoupon from "../models/UserCoupon.js";
import fs from "fs";
import path from "path";


// Main Dashboard Analytics
export const getDashboardAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const shopId = req.use.id;
        // Build date filter
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Build shop filter if provided
        const shopFilter = shopId ? { ownerId: shopId } : {};

        // Get all coupons with filters
        const coupons = await Coupon.find({
            ...shopFilter,
            ...dateFilter
        });

        // Get sales data
        const sales = await Sales.find({
            ...dateFilter
        }).populate('couponId');

        // Get user coupons data
        const userCoupons = await UserCoupon.find({
            ...dateFilter
        });

        // Calculate analytics
        const totalCoupons = coupons.length;
        const totalAmount = sales.reduce((sum, sale) => sum + (sale.finalAmount || 0), 0);
        const totalDiscount = sales.reduce((sum, sale) => sum + (sale.discountAmount || 0), 0);

        const usedCoupons = userCoupons.filter(uc => uc.status === 'used').length;
        const availableCoupons = userCoupons.filter(uc => uc.status === 'available').length;

        const averageDiscount = totalCoupons > 0 ? totalDiscount / totalCoupons : 0;
        const redeemRate = totalCoupons > 0 ? (usedCoupons / totalCoupons) * 100 : 0;

        // Top performing coupons
        const couponPerformance = await Sales.aggregate([
            {
                $match: dateFilter
            },
            {
                $group: {
                    _id: '$couponId',
                    totalSales: { $sum: '$finalAmount' },
                    totalDiscount: { $sum: '$discountAmount' },
                    usageCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'coupons',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'coupon'
                }
            },
            {
                $unwind: '$coupon'
            },
            {
                $project: {
                    serialNo: '$coupon.copuon_srno',
                    title: '$coupon.title',
                    shopName: '$coupon.shop_name',
                    image: { $arrayElemAt: ['$coupon.copuon_image', 0] },
                    totalSales: 1,
                    totalDiscount: 1,
                    usageCount: 1,
                    maxDistributions: '$coupon.maxDistributions',
                    currentDistributions: '$coupon.currentDistributions'
                }
            },
            {
                $sort: { totalSales: -1 }
            },
            {
                $limit: 10
            }
        ]);

        res.json({
            success: true,
            analytics: {
                totalCoupons,
                usedCoupons,
                availableCoupons,
                totalAmount: Math.round(totalAmount * 100) / 100,
                totalDiscount: Math.round(totalDiscount * 100) / 100,
                averageDiscount: Math.round(averageDiscount * 100) / 100,
                redeemRate: Math.round(redeemRate * 100) / 100
            },
            topCoupons: couponPerformance,
            chartData: await getChartData(dateFilter)
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard analytics',
            error: error.message
        });
    }
};

// Coupon List with Details
export const getCouponList = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status } = req.query;
        const skip = (page - 1) * limit;
        const shopId = req.use.id;

        // Build filter
        const filter = {};
        if (shopId) filter.ownerId = shopId;
        if (status) filter.active = status === 'active';
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { shop_name: { $regex: search, $options: 'i' } },
                { copuon_srno: { $regex: search, $options: 'i' } }
            ];
        }

        const coupons = await Coupon.find(filter)
            .populate('ownerId', 'name')
            .populate('category', 'name')
            .sort({ creationDate: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Get additional analytics for each coupon
        const couponsWithAnalytics = await Promise.all(
            coupons.map(async (coupon) => {
                const salesData = await Sales.aggregate([
                    { $match: { couponId: coupon._id } },
                    {
                        $group: {
                            _id: null,
                            totalAmount: { $sum: '$finalAmount' },
                            totalDiscount: { $sum: '$discountAmount' },
                            usedCount: { $sum: '$usedCount' }
                        }
                    }
                ]);

                const userCouponsCount = await UserCoupon.countDocuments({
                    couponId: coupon._id,
                    status: 'used'
                });

                const analytics = salesData[0] || {
                    totalAmount: 0,
                    totalDiscount: 0,
                    usedCount: 0
                };

                return {
                    _id: coupon._id,
                    serialNo: coupon.copuon_srno,
                    title: coupon.title,
                    shopName: coupon.shop_name,
                    image: coupon.copuon_image?.[0] || null,
                    amount: analytics.totalAmount,
                    discount: analytics.totalDiscount,
                    distribution: coupon.currentDistributions,
                    usedCoupon: userCouponsCount,
                    maxDistributions: coupon.maxDistributions,
                    discountPercentage: coupon.discountPercentage,
                    validTill: coupon.validTill,
                    active: coupon.active,
                    category: coupon.category
                };
            })
        );

        const total = await Coupon.countDocuments(filter);

        res.json({
            success: true,
            coupons: couponsWithAnalytics,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalCoupons: total,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching coupon list',
            error: error.message
        });
    }
};

// Coupon User Analytics
export const getCouponUserAnalytics = async (req, res) => {
    try {
        const { couponId, startDate, endDate } = req.query;

        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const couponFilter = couponId ? { couponId } : {};

        // User coupon statistics
        const userCouponStats = await UserCoupon.aggregate([
            {
                $match: {
                    ...couponFilter,
                    ...dateFilter
                }
            },
            {
                $lookup: {
                    from: 'coupons',
                    localField: 'couponId',
                    foreignField: '_id',
                    as: 'coupon'
                }
            },
            {
                $unwind: '$coupon'
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalUsers: { $addToSet: '$userId' }
                }
            }
        ]);

        // Transfer analytics
        const transferStats = await UserCoupon.aggregate([
            {
                $match: {
                    status: 'transferred',
                    ...couponFilter,
                    ...dateFilter
                }
            },
            {
                $unwind: '$senders'
            },
            {
                $group: {
                    _id: '$senders.senderId',
                    transferCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $project: {
                    userName: '$user.name',
                    email: '$user.email',
                    transferCount: 1
                }
            },
            {
                $sort: { transferCount: -1 }
            }
        ]);

        // Usage timeline
        const usageTimeline = await UserCoupon.aggregate([
            {
                $match: {
                    status: 'used',
                    ...couponFilter,
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$useDate' },
                        month: { $month: '$useDate' },
                        day: { $dayOfMonth: '$useDate' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
            }
        ]);

        res.json({
            success: true,
            userStats: userCouponStats,
            transferStats,
            usageTimeline,
            totalUserCoupons: userCouponStats.reduce((sum, stat) => sum + stat.count, 0)
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching coupon user analytics',
            error: error.message
        });
    }
};

// Sales Analytics
export const getSalesAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const shopId = req.use.id;

        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const shopFilter = shopId ? { 'coupon.ownerId': shopId } : {};

        // Sales aggregation
        const salesData = await Sales.aggregate([
            {
                $match: dateFilter
            },
            {
                $lookup: {
                    from: 'coupons',
                    localField: 'couponId',
                    foreignField: '_id',
                    as: 'coupon'
                }
            },
            {
                $unwind: '$coupon'
            },
            {
                $match: shopFilter
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: '$finalAmount' },
                    totalDiscount: { $sum: '$discountAmount' },
                    totalTransactions: { $sum: 1 },
                    averageTransactionValue: { $avg: '$finalAmount' }
                }
            }
        ]);

        // Daily sales trend
        const dailySales = await Sales.aggregate([
            {
                $match: dateFilter
            },
            {
                $lookup: {
                    from: 'coupons',
                    localField: 'couponId',
                    foreignField: '_id',
                    as: 'coupon'
                }
            },
            {
                $unwind: '$coupon'
            },
            {
                $match: shopFilter
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    dailySales: { $sum: '$finalAmount' },
                    dailyDiscount: { $sum: '$discountAmount' },
                    transactionCount: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
            }
        ]);

        // Top selling coupons
        const topSellingCoupons = await Sales.aggregate([
            {
                $match: dateFilter
            },
            {
                $lookup: {
                    from: 'coupons',
                    localField: 'couponId',
                    foreignField: '_id',
                    as: 'coupon'
                }
            },
            {
                $unwind: '$coupon'
            },
            {
                $match: shopFilter
            },
            {
                $group: {
                    _id: '$couponId',
                    couponTitle: { $first: '$coupon.title' },
                    shopName: { $first: '$coupon.shop_name' },
                    totalSales: { $sum: '$finalAmount' },
                    totalUsage: { $sum: 1 },
                    averageDiscount: { $avg: '$discountAmount' }
                }
            },
            {
                $sort: { totalSales: -1 }
            },
            {
                $limit: 10
            }
        ]);

        const result = salesData[0] || {
            totalSales: 0,
            totalDiscount: 0,
            totalTransactions: 0,
            averageTransactionValue: 0
        };

        res.json({
            success: true,
            salesSummary: result,
            dailySales,
            topSellingCoupons
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching sales analytics',
            error: error.message
        });
    }
};

// Helper function for chart data
const getChartData = async (dateFilter) => {
    try {
        // Monthly coupon creation trend
        const monthlyTrend = await Coupon.aggregate([
            {
                $match: dateFilter
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$creationDate' },
                        month: { $month: '$creationDate' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);

        // Status distribution
        const statusDistribution = await UserCoupon.aggregate([
            {
                $match: dateFilter
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            monthlyTrend,
            statusDistribution
        };
    } catch (error) {
        return {
            monthlyTrend: [],
            statusDistribution: []
        };
    }
};



// === INTERNAL HELPERS ===
const fetchDashboardAnalyticsData = async (userId, startDate, endDate) => {
    //   const { getDashboardAnalytics } = await import("./DashboardController.js");
    const req = { query: { startDate, endDate }, use: { id: userId } };
    let result = null;

    // Mock res.json to capture result
    const res = { json: (data) => (result = data) };
    await getDashboardAnalytics(req, res);
    return result;
};

const fetchCouponListData = async (userId, limit = 5) => {
    //   const { getCouponList } = await import("./DashboardController.js");
    const req = { query: { limit }, use: { id: userId } };
    let result = null;
    const res = { json: (data) => (result = data) };
    await getCouponList(req, res);
    return result;
};

const fetchSalesAnalyticsData = async (userId, startDate, endDate) => {
    //   const { getSalesAnalytics } = await import("./DashboardController.js");
    const req = { query: { startDate, endDate }, use: { id: userId } };
    let result = null;
    const res = { json: (data) => (result = data) };
    await getSalesAnalytics(req, res);
    return result;
};

const fetchCouponUserAnalyticsData = async (startDate, endDate) => {
    //   const { getCouponUserAnalytics } = await import("./DashboardController.js");
    const req = { query: { startDate, endDate } };
    let result = null;
    const res = { json: (data) => (result = data) };
    await getCouponUserAnalytics(req, res);
    return result;
};


export const exportDashboardPDF = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const userId = req.user?.id || req.use?.id;

        // Fetch partner info
        const partner = await PatnerProfile.findOne({ ownerId: userId }).lean();
        const partnerName = partner?.businessName || partner?.name || "Partner";
        const appName = "Inshopzz Partner Dashboard";

        // === CREATE PDF WITH PROPER FONT ===
        const doc = new PDFDocument({
            margin: 50,
            size: "A4",
            bufferPages: true
        });

        // Register a font that supports Unicode characters (including Rupee symbol)
        // You can use Helvetica which comes built-in with PDFKit
        const filePath = `/tmp/dashboard_report_${Date.now()}.pdf`;
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // === HEADER & FOOTER UTILS ===
        const addHeader = () => {
            doc
                .fontSize(14)
                .fillColor("#004aad")
                .text(appName, 50, 30, { align: "left" })
                .fillColor("black");
            doc.moveTo(50, 50).lineTo(550, 50).strokeColor("#004aad").stroke();
        };

        const addFooter = () => {
            doc
                .fontSize(10)
                .fillColor("#888")
                .text(`Generated at: ${new Date().toLocaleString()}`, 50, 770, {
                    align: "left",
                })
                .text("© 2025 Inshopzz", 0, 770, { align: "right" });
        };

        const newPage = () => {
            doc.addPage();
            addHeader();
        };

        // Helper to format currency - use 'Rs.' instead of ₹ symbol
        const formatCurrency = (amount) => {
            return `Rs. ${parseFloat(amount).toFixed(2)}`;
        };

        // === COVER PAGE ===
        addHeader();
        doc.moveDown(4);
        doc.fontSize(22).fillColor("#222").text("Dashboard Analytics Report", { align: "center" });
        doc.moveDown(1);
        doc.fontSize(14).fillColor("#555").text(`${partnerName}`, { align: "center" });
        doc.moveDown(1);
        doc
            .fontSize(12)
            .text(`Date Range: ${startDate || "All Time"} - ${endDate || "Now"}`, {
                align: "center",
            });
        doc.moveDown(1);
        doc.text(`Generated At: ${new Date().toLocaleString()}`, { align: "center" });
        doc.moveDown(4);
        doc.rect(100, 350, 400, 80).strokeColor("#004aad").stroke();
        doc.fontSize(14).fillColor("#004aad").text("Inshopzz Analytics Suite", 0, 375, {
            align: "center",
        });
        addFooter();
        newPage();

        // === FETCH ANALYTICS DATA ===
        const dashboardData = await fetchDashboardAnalyticsData(userId, startDate, endDate);
        const couponData = await fetchCouponListData(userId, 5);
        const salesData = await fetchSalesAnalyticsData(userId, startDate, endDate);
        const userData = await fetchCouponUserAnalyticsData(startDate, endDate);

        // === DASHBOARD SUMMARY ===
        const analytics = dashboardData.analytics;
        doc.fontSize(16).fillColor("#004aad").text("Dashboard Summary", { underline: true });
        doc.moveDown(0.5);

        const summary = [
            ["Total Coupons", analytics.totalCoupons || 0],
            ["Used Coupons", analytics.usedCoupons || 0],
            ["Available Coupons", analytics.availableCoupons || 0],
            ["Total Amount", formatCurrency(analytics.totalAmount || 0)],
            ["Total Discount", formatCurrency(analytics.totalDiscount || 0)],
            ["Average Discount", formatCurrency(analytics.averageDiscount || 0)],
            ["Redeem Rate (%)", `${parseFloat(analytics.redeemRate || 0).toFixed(2)}%`],
        ];

        // Draw summary table
        const tableTop = doc.y + 10;
        const startX = 60;
        const columnWidths = [250, 200];

        summary.forEach(([label, value], i) => {
            const y = tableTop + i * 25;
            doc
                .rect(startX, y, columnWidths[0], 25)
                .strokeColor("#ccc")
                .stroke()
                .rect(startX + columnWidths[0], y, columnWidths[1], 25)
                .stroke();

            doc.fillColor("#000").fontSize(12).text(String(label), startX + 10, y + 8);
            doc.fillColor("#004aad").text(String(value), startX + 260, y + 8);
        });
        addFooter();
        newPage();

        // === COUPON LIST ===
        doc.fontSize(16).fillColor("#004aad").text("Coupon Summary", { underline: true });
        doc.moveDown(0.5);
        const couponY = doc.y;
        const colX = [60, 200, 380, 500];
        const header = ["#", "Title", "Shop", "Used"];

        header.forEach((h, i) => {
            doc.fillColor("#004aad").fontSize(12).text(h, colX[i], couponY);
        });

        doc.moveTo(50, couponY + 15).lineTo(550, couponY + 15).strokeColor("#004aad").stroke();

        let currentY = couponY + 25;
        couponData.coupons.forEach((c, i) => {
            if (currentY > 700) {
                addFooter();
                newPage();
                currentY = doc.y + 10;

                // Redraw header on new page
                header.forEach((h, idx) => {
                    doc.fillColor("#004aad").fontSize(12).text(h, colX[idx], currentY);
                });
                doc.moveTo(50, currentY + 15).lineTo(550, currentY + 15).strokeColor("#004aad").stroke();
                currentY += 25;
            }

            doc
                .fillColor("#000")
                .fontSize(11)
                .text(String(i + 1), colX[0], currentY)
                .text(String(c.title || 'N/A'), colX[1], currentY, { width: 170, ellipsis: true })
                .text(String(c.shopName || 'N/A'), colX[2], currentY, { width: 110, ellipsis: true })
                .text(String(c.usedCoupon || 0), colX[3], currentY);

            currentY += 20;
        });
        addFooter();
        newPage();

        // === SALES SUMMARY ===
        const sales = salesData.salesSummary;
        doc.fontSize(16).fillColor("#004aad").text("Sales Analytics", { underline: true });
        doc.moveDown(1);
        doc.fillColor("#000").fontSize(12);
        doc.text(`Total Sales: ${formatCurrency(sales.totalSales || 0)}`);
        doc.text(`Total Discount: ${formatCurrency(sales.totalDiscount || 0)}`);
        doc.text(`Transactions: ${sales.totalTransactions || 0}`);
        doc.text(`Average Transaction Value: ${formatCurrency(sales.averageTransactionValue || 0)}`);
        doc.moveDown(1);
        doc.fillColor("#004aad").text("Top Selling Coupons:");
        doc.fillColor("#000");

        salesData.topSellingCoupons.forEach((c, i) => {
            const text = `${i + 1}. ${c.couponTitle || 'N/A'} (${c.shopName || 'N/A'}) - ${formatCurrency(c.totalSales || 0)}`;
            doc.text(text);
        });
        addFooter();
        newPage();

        // === USER STATS ===
        doc.fontSize(16).fillColor("#004aad").text("Coupon User Analytics", { underline: true });
        doc.moveDown(1);

        if (userData.userStats && userData.userStats.length > 0) {
            userData.userStats.forEach((u) => {
                doc.fillColor("#000").fontSize(12).text(`Status: ${u._id || 'N/A'} - Count: ${u.count || 0}`);
            });
        }

        doc.moveDown(1);
        doc.fillColor("#004aad").text("Top Transfers:");
        doc.fillColor("#000");

        if (userData.transferStats && userData.transferStats.length > 0) {
            userData.transferStats.slice(0, 5).forEach((t, i) => {
                doc.text(`${i + 1}. ${t.userName || 'N/A'} - ${t.transferCount || 0} transfers`);
            });
        }
        addFooter();

        // === END PDF ===
        doc.end();

        stream.on("finish", () => {
            res.download(filePath, "dashboard_report.pdf", (err) => {
                if (err) {
                    console.error("Download error:", err);
                } else {
                    // Delete file after successful download
                    fs.unlinkSync(filePath);
                }
            });
        });

    } catch (error) {
        console.error("PDF Export Error:", error);
        res.status(500).json({
            success: false,
            message: "Error generating dashboard PDF",
            error: error.message,
        });
    }
};