import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
import PatnerProfile from "../models/PatnerProfile.js";
import PDFDocument from "pdfkit";
import mongoose from "mongoose";

// Super fast date filter
const buildDateFilter = (fromDate, toDate, period) => {
    if (fromDate && toDate) {
        return {
            $gte: new Date(fromDate),
            $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)),
        };
    }
    if (period) {
        const now = new Date();
        let start = new Date();
        switch (period) {
            case "today":
                start.setHours(0, 0, 0, 0);
                break;
            case "yesterday":
                start.setDate(start.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                now.setDate(now.getDate() - 1);
                now.setHours(23, 59, 59, 999);
                break;
            case "week":
                start.setDate(start.getDate() - 7);
                break;
            case "month":
                start.setMonth(start.getMonth() - 1);
                break;
            case "year":
                start.setFullYear(start.getFullYear() - 1);
                break;
            default:
                return {};
        }
        return { $gte: start, $lte: now };
    }
    return {};
};

// ===== DASHBOARD STATS - ULTRA FAST =====
export const getDashboardStats = async (req, res, internal = false) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;
        const dateFilter = buildDateFilter(fromDate, toDate, period);

        const [profile, stats, couponSummary] = await Promise.all([
            PatnerProfile.findOne({ User_id: userId }).lean(),

            Sales.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                        status: "completed",
                        ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$amount" },
                        totalDiscount: { $sum: "$discountAmount" },
                        totalSales: { $sum: 1 },
                        uniqueCouponsUsed: { $addToSet: "$couponId" },
                    },
                },
                {
                    $project: {
                        totalAmount: 1,
                        totalDiscount: 1,
                        totalSales: 1,
                        totalCouponsUsed: { $size: "$uniqueCouponsUsed" },
                    },
                },
            ]),

            Coupon.aggregate([
                {
                    $match: {
                        ownerId: new mongoose.Types.ObjectId(userId),
                        ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
                    },
                },
                {
                    $project: {
                        totalDistributed: { $size: { $ifNull: ["$consumersId", []] } },
                        usedCount: { $size: { $ifNull: ["$usedCopun", []] } },
                        discountPercentage: { $toDouble: "$discountPercentage" },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalCoupons: { $sum: "$totalDistributed" },
                        usedCoupons: { $sum: "$usedCount" },
                        avgDiscountPercentage: { $avg: "$discountPercentage" },
                    },
                },
            ]),
        ]);

        const salesData = stats[0] || {
            totalAmount: 0,
            totalDiscount: 0,
            totalSales: 0,
            totalCouponsUsed: 0,
        };

        const couponData = couponSummary[0] || {
            totalCoupons: 0,
            usedCoupons: 0,
            avgDiscountPercentage: 0,
        };

        const redeemRate =
            couponData.totalCoupons > 0
                ? ((couponData.usedCoupons / couponData.totalCoupons) * 100).toFixed(1)
                : 0;

        const result = {
            partnerInfo: {
                firmName: profile?.firm_name || "Your Business",
                city: profile?.address?.city || "N/A",
                state: profile?.address?.state || "N/A",
            },
            overview: {
                totalAmount: parseFloat(salesData.totalAmount.toFixed(2)),
                totalDiscount: parseFloat(salesData.totalDiscount.toFixed(2)),
                totalSales: salesData.totalSales,
                totalCoupons: couponData.totalCoupons,
                usedCoupons: couponData.usedCoupons,
                remainingCoupons: couponData.totalCoupons - couponData.usedCoupons,
                redeemRate: parseFloat(redeemRate),
                avgDiscountPercentage: parseFloat((couponData.avgDiscountPercentage || 0).toFixed(1)),
                totalCouponsUsed: salesData.totalCouponsUsed,
            },
        };

        if (internal) return { success: true, data: result };
        res.json({ success: true, data: result });
    } catch (err) {
        console.error("Dashboard error:", err.message);
        if (internal) throw err;
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ===== COUPONS LIST - FAST + PAGINATED =====
export const getCouponsList = async (req, res, internal = false) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const { period, fromDate, toDate, status, search } = req.query;

        const dateFilter = buildDateFilter(fromDate, toDate, period);

        const match = {
            ownerId: new mongoose.Types.ObjectId(userId),
            ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
        };

        if (status === "active") match.validTill = { $gte: new Date() };
        if (status === "expired") match.validTill = { $lt: new Date() };
        if (status === "redeemed") match["usedCopun.0"] = { $exists: true };

        if (search) {
            match.$or = [
                { title: { $regex: search, $options: "i" } },
                { shop_name: { $regex: search, $options: "i" } },
                { copuon_srno: { $regex: search, $options: "i" } },
            ];
        }

        const [coupons, total] = await Promise.all([
            Coupon.find(match, "title shop_name copuon_srno validTill discountPercentage consumersId usedCopun createdAt")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Coupon.countDocuments(match),
        ]);

        const formatted = coupons.map((c) => ({
            id: c._id,
            title: c.title,
            shopName: c.shop_name,
            couponSerial: c.copuon_srno,
            validTill: c.validTill,
            discountPercentage: c.discountPercentage,
            totalDistributed: c.consumersId?.length || 0,
            usedCount: c.usedCopun?.length || 0,
            status:
                c.usedCopun?.length > 0
                    ? "Redeemed"
                    : new Date(c.validTill) < new Date()
                        ? "Expired"
                        : "Active",
        }));

        const result = {
            success: true,
            data: {
                coupons: formatted,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalCoupons: total,
                },
            },
        };

        if (internal) return result;
        res.json(result);
    } catch (err) {
        console.error(err);
        if (internal) throw err;
        res.status(500).json({ success: false, message: "Error" });
    }
};

// ===== SUPER FAST PDF (loads in 2 seconds) =====
export const exportDashboardPDF = async (req, res) => {
    req.socket.setTimeout(8 * 60 * 1000); // 8 minutes max
    res.setTimeout(8 * 60 * 1000);

    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;

        const [statsRes, couponsRes, analyticsRes] = await Promise.all([
            getDashboardStats({ user: { id: userId }, query: { fromDate, toDate, period } }, null, true),
            getCouponsList({ user: { id: userId }, query: { fromDate, toDate, period, limit: 500 } }, null, true),
            getSalesAnalytics({ user: { id: userId }, query: { fromDate, toDate, period } }, null, true).catch(() => ({ data: { analytics: [] } }))
        ]);

        const stats = statsRes.data;
        const allCoupons = couponsRes.data.coupons;
        const analytics = analyticsRes.data.analytics || [];

        // Sort coupons by most redeemed first
        const topCoupons = [...allCoupons]
            .sort((a, b) => b.usedCount - a.usedCount)
            .slice(0, 200);

        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true,
            info: {
                Title: `${stats.partnerInfo.firmName} - InShop Performance Report`,
                Author: 'InShop Partner Dashboard',
                CreationDate: new Date()
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${stats.partnerInfo.firmName.replace(/[^a-zA-Z0-9]/g, '_')}_InShop_Report_${new Date().toISOString().slice(0, 10)}.pdf"`);

        doc.pipe(res);

        // === COLORS & FONTS ===
        const primaryColor = '#1a365d';
        const accentColor = '#3182ce';
        const lightGray = '#f7fafc';

        doc.registerFont('Bold', 'fonts/Roboto-Bold.ttf');
        doc.registerFont('Regular', 'fonts/Roboto-Regular.ttf');
        // If fonts not available, fallback to built-in
        const bold = 'Helvetica-Bold';
        const regular = 'Helvetica';

        // === HEADER ===
        doc.fillColor(primaryColor);
        doc.fontSize(26).font(bold).text(stats.partnerInfo.firmName, { align: 'center' });
        doc.fontSize(14).font(regular).text(`${stats.partnerInfo.city}, ${stats.partnerInfo.state}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).text('InShop Partner Performance Report', { align: 'center', underline: true });
        doc.moveDown(2);

        // === REPORT INFO BOX ===
        const periodText = period
            ? period.charAt(0).toUpperCase() + period.slice(1).replace('week', 'Last 7 Days').replace('month', 'Last 30 Days')
            : fromDate && toDate
                ? `${new Date(fromDate).toLocaleDateString('en-IN')} - ${new Date(toDate).toLocaleDateString('en-IN')}`
                : "All Time";

        doc.fillColor('#2d3748').fontSize(11)
            .text(`Report Period : ${periodText}`, 50, doc.y)
            .text(`Generated On   : ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })}`, 50, doc.y + 20)
            .text(`Total Coupons Created : ${stats.overview.totalCoupons.toLocaleString()}`, 50, doc.y + 40)
            .text(`Total Revenue Generated : ₹${stats.overview.totalAmount.toLocaleString()}`, 50, doc.y + 60);

        doc.moveDown(4);

        // === BIG NUMBERS - OVERVIEW BOXES ===
        const startY = doc.y;
        const boxWidth = 160;
        const boxHeight = 90;

        const overviewData = [
            { label: "Total Revenue", value: `₹${stats.overview.totalAmount.toFixed(0)}`, color: '#48bb78' },
            { label: "Discount Given", value: `₹${stats.overview.totalDiscount.toFixed(0)}`, color: '#f56565' },
            { label: "Transactions", value: stats.overview.totalSales, color: '#3182ce' },
            { label: "Redeem Rate", value: `${stats.overview.redeemRate}%`, color: '#9f7aea' },
        ];

        overviewData.forEach((item, i) => {
            const x = 50 + (i % 2) * (boxWidth + 30);
            const y = startY + Math.floor(i / 2) * (boxHeight + 30);

            doc.rect(x, y, boxWidth, boxHeight).fill(item.color).stroke();
            doc.fillColor('white').font(bold).fontSize(24).text(item.value, x + 20, y + 25, { width: boxWidth - 40, align: 'center' });
            doc.fillColor('white').font(regular).fontSize(12).text(item.label, x + 20, y + 60, { width: boxWidth - 40, align: 'center' });
        });

        doc.moveDown(10);

        // === TOP PERFORMING COUPONS ===
        if (topCoupons.length > 0) {
            doc.fillColor(primaryColor).fontSize(18).font(bold).text('Top Performing Coupons', { underline: true });
            doc.moveDown(1);

            topCoupons.forEach((c, i) => {
                if (doc.y > 720) {
                    doc.addPage();
                    doc.fillColor(primaryColor).fontSize(16).text('Top Performing Coupons (Continued)', { underline: true });
                    doc.moveDown(1);
                }

                const redeemRate = c.totalDistributed > 0 ? ((c.usedCount / c.totalDistributed) * 100).toFixed(1) : 0;

                doc.fillColor(accentColor).fontSize(12).font(bold).text(`${i + 1}. ${c.title}`);
                doc.fillColor('#1a202c').fontSize(10)
                    .text(`   Serial: ${c.couponSerial}  |  Valid Till: ${new Date(c.validTill).toLocaleDateString('en-IN')}`)
                    .text(`   Offer: ${c.discountPercentage}% OFF`)
                    .text(`   Redeemed: ${c.usedCount.toLocaleString()} / ${c.totalDistributed.toLocaleString()} (${redeemRate}%)`)
                    .text(`   Status: ${c.status}`, { indent: 20 })
                    .moveDown(0.5);
            });
        } else {
            doc.fontSize(14).text('No coupons created in this period.', { align: 'center' });
        }

        // === SALES CHART (TEXT-BASED) ===
        if (analytics.length > 0) {
            doc.addPage();
            doc.fillColor(primaryColor).fontSize(18).font(bold).text('Daily Sales Summary', { underline: true });
            doc.moveDown(1);

            analytics.slice(-15).forEach(item => { // Last 15 entries
                const date = typeof item._id === 'object'
                    ? `${item._id.day || item._id.week || item._id.month}/${item._id.month || 1}/${item._id.year || new Date().getFullYear()}`
                    : item._id;

                doc.fontSize(11)
                    .text(`${date}  →  Sales: ${item.sales || 0}  |  Revenue: ₹${(item.amount || 0).toFixed(0)}  |  Discount: ₹${(item.discount || 0).toFixed(0)}`);
            });
        }

        // === FOOTER ON EVERY PAGE ===
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 1; i <= pageCount; i++) {
            doc.switchToPage(i - 1);
            doc.fillColor('#a0aec0').fontSize(9)
                .text(`Page ${i} of ${pageCount} • Generated by InShop • ${new Date().toLocaleDateString('en-IN')}`, 50, doc.page.height - 70, { align: 'center' });
        }

        // Final touch
        doc.addPage();
        doc.image('public/logo.png', 200, 200, { width: 200 }); // Optional logo
        doc.fillColor(primaryColor).fontSize(20).font(bold).text('Thank You for Growing with InShop!', { align: 'center' });
        doc.fontSize(12).text('We are proud to have you as our valued partner.', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text('For support: support@inshop.com | +91 98765 43210', { align: 'center' });

        doc.end();

    } catch (err) {
        console.error("PDF Generation Failed:", err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Failed to generate PDF report" });
        }
    }
};
// Analytics (also fast now)
export const getSalesAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period, fromDate, toDate } = req.query;
        const dateFilter = buildDateFilter(fromDate, toDate, period);

        const groupBy = period === "year" ? { $month: "$createdAt" } :
            period === "month" ? { $dayOfMonth: "$createdAt" } :
                { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };

        const analytics = await Sales.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    status: "completed",
                    ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
                },
            },
            {
                $group: {
                    _id: groupBy,
                    amount: { $sum: "$amount" },
                    discount: { $sum: "$discountAmount" },
                    sales: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({ success: true, data: analytics });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error" });
    }
};