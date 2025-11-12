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

        const doc = new PDFDocument({ margin: 40 });
        const filePath = `/tmp/dashboard_report_${Date.now()}.pdf`;
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // === COVER PAGE ===
        doc.fontSize(20).text("📊 Dashboard Analytics Report", { align: "center" });
        doc.moveDown(1);
        doc
            .fontSize(12)
            .text(`Date Range: ${startDate || "All Time"} - ${endDate || "Now"}`, { align: "center" });
        doc.moveDown(2);
        doc.text(`Generated At: ${new Date().toLocaleString()}`, { align: "center" });
        doc.addPage();

        // === Fetch all analytics ===
        const dashboardData = await fetchDashboardAnalyticsData(userId, startDate, endDate);
        const couponData = await fetchCouponListData(userId, 5);
        const salesData = await fetchSalesAnalyticsData(userId, startDate, endDate);
        const userData = await fetchCouponUserAnalyticsData(startDate, endDate);

        // === DASHBOARD SUMMARY ===
        const analytics = dashboardData.analytics;
        doc.fontSize(16).text("📈 Dashboard Summary", { underline: true });
        doc.moveDown(1);
        doc.fontSize(12);
        doc.text(`Total Coupons: ${analytics.totalCoupons}`);
        doc.text(`Used Coupons: ${analytics.usedCoupons}`);
        doc.text(`Available Coupons: ${analytics.availableCoupons}`);
        doc.text(`Total Amount: ₹${analytics.totalAmount}`);
        doc.text(`Total Discount: ₹${analytics.totalDiscount}`);
        doc.text(`Average Discount: ₹${analytics.averageDiscount}`);
        doc.text(`Redeem Rate: ${analytics.redeemRate}%`);
        doc.addPage();

        // === COUPON LIST ===
        doc.fontSize(16).text("🎟️ Coupon Summary", { underline: true });
        doc.moveDown(1);
        couponData.coupons.forEach((c, i) => {
            doc.text(`${i + 1}. ${c.title} | ${c.shopName} | Used: ${c.usedCoupon}`);
        });
        doc.addPage();

        // === SALES SUMMARY ===
        doc.fontSize(16).text("💰 Sales Analytics", { underline: true });
        doc.moveDown(1);
        const sales = salesData.salesSummary;
        doc.text(`Total Sales: ₹${sales.totalSales}`);
        doc.text(`Total Discount: ₹${sales.totalDiscount}`);
        doc.text(`Transactions: ${sales.totalTransactions}`);
        doc.text(`Avg Transaction: ₹${sales.averageTransactionValue}`);
        doc.moveDown(1);
        doc.text("Top Selling Coupons:");
        salesData.topSellingCoupons.forEach((c, i) => {
            doc.text(`${i + 1}. ${c.couponTitle} (${c.shopName}) — ₹${c.totalSales}`);
        });
        doc.addPage();

        // === USER STATS ===
        doc.fontSize(16).text("👥 Coupon User Analytics", { underline: true });
        doc.moveDown(1);
        userData.userStats.forEach((u) => {
            doc.text(`Status: ${u._id} — Count: ${u.count}`);
        });
        doc.moveDown(1);
        doc.text("Top Transfers:");
        userData.transferStats.slice(0, 5).forEach((t, i) => {
            doc.text(`${i + 1}. ${t.userName} — ${t.transferCount} transfers`);
        });

        // === End PDF ===
        doc.end();

        stream.on("finish", () => {
            res.download(filePath, "dashboard_report.pdf", (err) => {
                if (!err) fs.unlinkSync(filePath);
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
