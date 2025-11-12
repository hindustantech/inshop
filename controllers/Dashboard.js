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

        // === COLOR SCHEME ===
        const colors = {
            primary: '#004aad',
            secondary: '#0066cc',
            accent: '#ff6b35',
            success: '#28a745',
            dark: '#1a1a1a',
            gray: '#6c757d',
            lightGray: '#f8f9fa',
            border: '#dee2e6'
        };

        // === CREATE PDF ===
        const doc = new PDFDocument({ 
            margin: 40, 
            size: "A4",
            bufferPages: true,
            autoFirstPage: false
        });
        
        const filePath = `/tmp/dashboard_report_${Date.now()}.pdf`;
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // === UTILITY FUNCTIONS ===
        const formatCurrency = (amount) => {
            return `Rs. ${parseFloat(amount || 0).toFixed(2)}`;
        };

        const formatNumber = (num) => {
            return new Intl.NumberFormat('en-IN').format(num || 0);
        };

        const formatDate = (date) => {
            return new Date(date).toLocaleDateString('en-IN', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        };

        // === HEADER & FOOTER ===
        const addHeader = (pageTitle = '') => {
            // Gradient-like header background
            doc.rect(0, 0, 595, 80).fill(colors.primary);
            doc.rect(0, 70, 595, 10).fill(colors.secondary);
            
            // App name
            doc.fontSize(18).fillColor('white').text(appName, 40, 25, { align: 'left' });
            
            // Page title
            if (pageTitle) {
                doc.fontSize(11).fillColor('#e0e0e0').text(pageTitle, 40, 50, { align: 'left' });
            }
            
            // Date on right
            doc.fontSize(9).fillColor('#e0e0e0')
               .text(formatDate(new Date()), 0, 30, { align: 'right', width: 555 });
        };

        const addFooter = (pageNum, totalPages) => {
            const bottomY = 770;
            
            // Footer line
            doc.moveTo(40, bottomY - 10).lineTo(555, bottomY - 10)
               .strokeColor(colors.border).lineWidth(0.5).stroke();
            
            // Left side - generation time
            doc.fontSize(8).fillColor(colors.gray)
               .text(`Generated: ${new Date().toLocaleString('en-IN')}`, 40, bottomY);
            
            // Center - page number
            doc.text(`Page ${pageNum} of ${totalPages}`, 0, bottomY, { 
                align: 'center', 
                width: 595 
            });
            
            // Right side - copyright
            doc.text('© 2025 Inshopzz', 0, bottomY, { 
                align: 'right', 
                width: 555 
            });
        };

        // === COVER PAGE ===
        doc.addPage();
        
        // Gradient background effect
        doc.rect(0, 0, 595, 842).fill('#f8f9fa');
        doc.rect(0, 0, 595, 300).fill(colors.primary);
        
        // Large title area
        doc.fontSize(32).fillColor('white').font('Helvetica-Bold')
           .text('Analytics Report', 0, 120, { align: 'center', width: 595 });
        
        doc.fontSize(16).fillColor('#e0e0e0').font('Helvetica')
           .text('Dashboard Performance Overview', 0, 165, { align: 'center', width: 595 });
        
        // Partner info card
        const cardY = 320;
        doc.roundedRect(100, cardY, 395, 180, 10).fill('white');
        doc.roundedRect(100, cardY, 395, 60, 10).fill(colors.secondary);
        
        doc.fontSize(20).fillColor('white').font('Helvetica-Bold')
           .text(partnerName, 120, cardY + 20, { width: 355 });
        
        // Info items in card
        doc.fontSize(11).fillColor(colors.dark).font('Helvetica');
        const infoY = cardY + 90;
        doc.text('Report Period', 120, infoY);
        doc.fontSize(13).fillColor(colors.primary).font('Helvetica-Bold')
           .text(`${startDate || 'All Time'} - ${endDate || 'Now'}`, 120, infoY + 18);
        
        doc.fontSize(11).fillColor(colors.dark).font('Helvetica')
           .text('Generated On', 120, infoY + 50);
        doc.fontSize(13).fillColor(colors.primary).font('Helvetica-Bold')
           .text(formatDate(new Date()), 120, infoY + 68);
        
        // Decorative elements
        doc.circle(530, 750, 60).fill(colors.secondary).opacity(0.1);
        doc.circle(65, 650, 40).fill(colors.accent).opacity(0.1);
        doc.opacity(1);

        // === FETCH DATA ===
        const dashboardData = await fetchDashboardAnalyticsData(userId, startDate, endDate);
        const couponData = await fetchCouponListData(userId, 20);
        const salesData = await fetchSalesAnalyticsData(userId, startDate, endDate);
        const userData = await fetchCouponUserAnalyticsData(startDate, endDate);

        // === DASHBOARD SUMMARY PAGE ===
        doc.addPage();
        addHeader('Dashboard Summary');
        doc.moveDown(6);

        const analytics = dashboardData.analytics;
        
        // Key Metrics Cards
        const metrics = [
            { label: 'Total Coupons', value: formatNumber(analytics.totalCoupons), icon: '■', color: colors.primary },
            { label: 'Used Coupons', value: formatNumber(analytics.usedCoupons), icon: '●', color: colors.success },
            { label: 'Available', value: formatNumber(analytics.availableCoupons), icon: '◆', color: colors.accent },
            { label: 'Redeem Rate', value: `${parseFloat(analytics.redeemRate || 0).toFixed(1)}%`, icon: '▲', color: colors.secondary }
        ];

        let cardX = 40;
        const metricsCardY = doc.y;
        const cardWidth = 120;
        const cardHeight = 80;
        const cardGap = 15;

        metrics.forEach((metric, i) => {
            const x = cardX + (i * (cardWidth + cardGap));
            
            // Card background
            doc.roundedRect(x, metricsCardY, cardWidth, cardHeight, 8)
               .fill('white')
               .strokeColor(colors.border)
               .lineWidth(1)
               .stroke();
            
            // Colored top bar
            doc.roundedRect(x, metricsCardY, cardWidth, 25, 8)
               .fill(metric.color);
            
            // Icon
            doc.fontSize(16).fillColor('white')
               .text(metric.icon, x + 10, metricsCardY + 5);
            
            // Value
            doc.fontSize(20).fillColor(colors.dark).font('Helvetica-Bold')
               .text(metric.value, x + 10, metricsCardY + 35, { width: cardWidth - 20, align: 'left' });
            
            // Label
            doc.fontSize(9).fillColor(colors.gray).font('Helvetica')
               .text(metric.label, x + 10, metricsCardY + 62, { width: cardWidth - 20 });
        });

        doc.moveDown(8);

        // Financial Summary Table
        doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold')
           .text('Financial Overview', 40, doc.y);
        
        doc.moveDown(1);
        
        const financeData = [
            ['Total Amount', formatCurrency(analytics.totalAmount)],
            ['Total Discount', formatCurrency(analytics.totalDiscount)],
            ['Average Discount', formatCurrency(analytics.averageDiscount)]
        ];

        const tableStartY = doc.y + 10;
        const col1Width = 200;
        const col2Width = 250;
        
        financeData.forEach((row, i) => {
            const y = tableStartY + (i * 35);
            const isEven = i % 2 === 0;
            
            // Alternating row background
            if (isEven) {
                doc.rect(40, y, col1Width + col2Width, 35)
                   .fill(colors.lightGray);
            }
            
            // Label
            doc.fontSize(11).fillColor(colors.dark).font('Helvetica')
               .text(row[0], 50, y + 12);
            
            // Value
            doc.fontSize(13).fillColor(colors.primary).font('Helvetica-Bold')
               .text(row[1], 260, y + 12);
        });

        addFooter(2, 5);

        // === COUPON LIST PAGE ===
        doc.addPage();
        addHeader('Coupon Performance');
        doc.moveDown(6);

        doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold')
           .text('Top Performing Coupons', 40, doc.y);
        
        doc.moveDown(1);

        // Table header
        const headerY = doc.y + 10;
        doc.rect(40, headerY, 515, 30).fill(colors.primary);
        
        const columns = [
            { label: '#', x: 50, width: 30 },
            { label: 'Coupon Title', x: 85, width: 180 },
            { label: 'Shop Name', x: 270, width: 150 },
            { label: 'Used', x: 480, width: 60 }
        ];

        columns.forEach(col => {
            doc.fontSize(10).fillColor('white').font('Helvetica-Bold')
               .text(col.label, col.x, headerY + 10, { width: col.width });
        });

        // Table rows
        let rowY = headerY + 35;
        couponData.coupons.slice(0, 15).forEach((coupon, i) => {
            if (rowY > 720) {
                addFooter(3, 5);
                doc.addPage();
                addHeader('Coupon Performance (Continued)');
                rowY = 120;
            }

            const isEven = i % 2 === 0;
            
            // Alternating row background
            if (isEven) {
                doc.rect(40, rowY, 515, 25).fill(colors.lightGray);
            }

            doc.fontSize(10).fillColor(colors.dark).font('Helvetica');
            
            // Serial number
            doc.text(String(i + 1), columns[0].x, rowY + 8, { width: columns[0].width });
            
            // Coupon title
            doc.text(String(coupon.title || 'N/A'), columns[1].x, rowY + 8, { 
                width: columns[1].width, 
                ellipsis: true 
            });
            
            // Shop name
            doc.text(String(coupon.shopName || 'N/A'), columns[2].x, rowY + 8, { 
                width: columns[2].width, 
                ellipsis: true 
            });
            
            // Used count with badge
            const usedCount = String(coupon.usedCoupon || 0);
            doc.roundedRect(columns[3].x, rowY + 5, 50, 18, 4)
               .fill(colors.success)
               .fillColor('white')
               .fontSize(9)
               .font('Helvetica-Bold')
               .text(usedCount, columns[3].x, rowY + 9, { 
                   width: 50, 
                   align: 'center' 
               });

            rowY += 25;
        });

        addFooter(3, 5);

        // === SALES ANALYTICS PAGE ===
        doc.addPage();
        addHeader('Sales Analytics');
        doc.moveDown(6);

        const sales = salesData.salesSummary;

        // Sales metrics grid
        doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold')
           .text('Sales Performance', 40, doc.y);
        
        doc.moveDown(1.5);

        const salesMetrics = [
            { label: 'Total Sales', value: formatCurrency(sales.totalSales), color: colors.success },
            { label: 'Total Discount', value: formatCurrency(sales.totalDiscount), color: colors.accent },
            { label: 'Transactions', value: formatNumber(sales.totalTransactions), color: colors.primary },
            { label: 'Avg. Transaction', value: formatCurrency(sales.averageTransactionValue), color: colors.secondary }
        ];

        let metricsY = doc.y;
        salesMetrics.forEach((metric, i) => {
            const row = Math.floor(i / 2);
            const col = i % 2;
            const x = 40 + (col * 260);
            const y = metricsY + (row * 70);

            // Metric card
            doc.roundedRect(x, y, 240, 60, 8)
               .fill('white')
               .strokeColor(metric.color)
               .lineWidth(2)
               .stroke();

            // Colored left border
            doc.rect(x, y + 8, 4, 44).fill(metric.color);

            doc.fontSize(10).fillColor(colors.gray).font('Helvetica')
               .text(metric.label, x + 15, y + 15);

            doc.fontSize(18).fillColor(metric.color).font('Helvetica-Bold')
               .text(metric.value, x + 15, y + 32);
        });

        doc.moveDown(12);

        // Top selling coupons
        doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold')
           .text('Top Selling Coupons', 40, doc.y);
        
        doc.moveDown(1);

        salesData.topSellingCoupons.slice(0, 8).forEach((coupon, i) => {
            const y = doc.y;
            
            // Rank badge
            doc.circle(55, y + 10, 12).fill(colors.secondary);
            doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
               .text(String(i + 1), 50, y + 6);

            // Coupon details
            doc.fontSize(11).fillColor(colors.dark).font('Helvetica-Bold')
               .text(String(coupon.couponTitle || 'N/A'), 75, y + 3, { width: 250 });

            doc.fontSize(9).fillColor(colors.gray).font('Helvetica')
               .text(String(coupon.shopName || 'N/A'), 75, y + 18, { width: 250 });

            // Sales amount
            doc.fontSize(12).fillColor(colors.success).font('Helvetica-Bold')
               .text(formatCurrency(coupon.totalSales), 400, y + 8);

            doc.moveDown(2);
        });

        addFooter(4, 5);

        // === USER ANALYTICS PAGE ===
        doc.addPage();
        addHeader('User Analytics');
        doc.moveDown(6);

        // User stats
        doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold')
           .text('Coupon Status Distribution', 40, doc.y);
        
        doc.moveDown(1);

        if (userData.userStats && userData.userStats.length > 0) {
            const statsY = doc.y;
            userData.userStats.forEach((stat, i) => {
                const y = statsY + (i * 40);
                
                doc.roundedRect(40, y, 515, 35, 6)
                   .fill('white')
                   .strokeColor(colors.border)
                   .stroke();

                // Status label
                doc.fontSize(12).fillColor(colors.dark).font('Helvetica-Bold')
                   .text(String(stat._id || 'N/A'), 55, y + 12);

                // Count badge
                doc.roundedRect(440, y + 8, 100, 20, 10)
                   .fill(colors.primary);
                
                doc.fontSize(11).fillColor('white').font('Helvetica-Bold')
                   .text(`${formatNumber(stat.count)} Users`, 445, y + 12, { 
                       width: 90, 
                       align: 'center' 
                   });
            });
            
            doc.moveDown(userData.userStats.length * 2.5 + 2);
        }

        // Top transfers
        doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold')
           .text('Top Coupon Transfers', 40, doc.y);
        
        doc.moveDown(1);

        if (userData.transferStats && userData.transferStats.length > 0) {
            userData.transferStats.slice(0, 10).forEach((transfer, i) => {
                const y = doc.y;
                const barWidth = Math.min((transfer.transferCount / userData.transferStats[0].transferCount) * 300, 300);

                // User name
                doc.fontSize(10).fillColor(colors.dark).font('Helvetica')
                   .text(String(transfer.userName || 'N/A'), 40, y, { width: 150 });

                // Progress bar background
                doc.rect(200, y, 300, 15)
                   .fill('#e9ecef');

                // Progress bar fill
                doc.rect(200, y, barWidth, 15)
                   .fill(colors.secondary);

                // Transfer count
                doc.fontSize(10).fillColor(colors.dark).font('Helvetica-Bold')
                   .text(`${formatNumber(transfer.transferCount)} transfers`, 510, y);

                doc.moveDown(1.3);
            });
        }

        addFooter(5, 5);

        // === FINALIZE PDF ===
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(i);
            if (i > 0) { // Skip cover page
                addFooter(i + 1, range.count);
            }
        }

        doc.end();
        
        stream.on("finish", () => {
            res.download(filePath, `Inshopzz_Analytics_Report_${Date.now()}.pdf`, (err) => {
                if (err) {
                    console.error("Download error:", err);
                } else {
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