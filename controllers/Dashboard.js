import Coupon from "../models/coupunModel.js";
import Sales from "../models/Sales.js";
import PatnerProfile from "../models/PatnerProfile.js";
import PDFDocument from 'pdfkit';
import mongoose from "mongoose";

// Helper function to build date filter
const buildDateFilter = (fromDate, toDate) => {
    const filter = {};
    
    if (fromDate && toDate) {
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999); // End of day
        
        filter.createdAt = {
            $gte: startDate,
            $lte: endDate
        };
    } else if (fromDate) {
        filter.createdAt = {
            $gte: new Date(fromDate)
        };
    } else if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt = {
            $lte: endDate
        };
    }
    
    return filter;
};

// Dashboard Statistics Controller with Date Filter
export const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;
        
        // Get partner profile for logo and firm name
        const partnerProfile = await PatnerProfile.findOne({ User_id: userId });
        
        // Build date filter
        let dateFilter = buildDateFilter(fromDate, toDate);
        
        // If period is provided, override date filter
        if (period && !fromDate && !toDate) {
            let startDate = new Date();
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
                    // All time - no date filter
                    startDate = null;
            }
            
            if (startDate) {
                dateFilter.createdAt = {
                    $gte: startDate,
                    $lte: endDate
                };
            }
        }
        
        // Base match conditions
        const salesMatch = {
            userId: new mongoose.Types.ObjectId(userId),
            status: "completed",
            ...dateFilter
        };
        
        const couponMatch = {
            ownerId: new mongoose.Types.ObjectId(userId),
            ...(dateFilter.createdAt ? {
                createdAt: dateFilter.createdAt
            } : {})
        };

        // Calculate total statistics
        const totalStats = await Sales.aggregate([
            { $match: salesMatch },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" },
                    totalDiscount: { $sum: "$discountAmount" },
                    totalSales: { $sum: 1 }
                }
            }
        ]);

        // Calculate coupon statistics
        const couponStats = await Coupon.aggregate([
            { $match: couponMatch },
            {
                $lookup: {
                    from: "sales",
                    let: { couponId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$couponId", "$$couponId"] },
                                        { $eq: ["$status", "completed"] },
                                        ...(dateFilter.createdAt ? [
                                            { $gte: ["$createdAt", dateFilter.createdAt.$gte] },
                                            { $lte: ["$createdAt", dateFilter.createdAt.$lte] }
                                        ] : [])
                                    ]
                                }
                            }
                        }
                    ],
                    as: "filteredSales"
                }
            },
            {
                $project: {
                    title: 1,
                    validTill: 1,
                    discountPercentage: 1,
                    usedCopun: 1,
                    consumersId: 1,
                    createdAt: 1,
                    totalCoupons: { $size: "$consumersId" },
                    usedCoupons: { 
                        $size: {
                            $filter: {
                                input: "$usedCopun",
                                as: "used",
                                cond: true
                            }
                        }
                    },
                    filteredSales: 1,
                    salesAmount: { $sum: "$filteredSales.amount" },
                    salesDiscount: { $sum: "$filteredSales.discountAmount" }
                }
            },
            {
                $group: {
                    _id: null,
                    totalCoupons: { $sum: "$totalCoupons" },
                    usedCoupons: { $sum: "$usedCoupons" },
                    avgDiscountPercentage: { $avg: { $toDouble: "$discountPercentage" } },
                    totalSalesAmount: { $sum: "$salesAmount" },
                    totalSalesDiscount: { $sum: "$salesDiscount" }
                }
            }
        ]);

        // Calculate average discount per coupon
        const avgDiscountPerCoupon = await Sales.aggregate([
            { $match: salesMatch },
            {
                $group: {
                    _id: "$couponId",
                    avgDiscount: { $avg: "$discountAmount" },
                    couponCount: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: null,
                    overallAvgDiscount: { $avg: "$avgDiscount" },
                    totalCouponsUsed: { $sum: "$couponCount" }
                }
            }
        ]);

        const totalAmount = totalStats[0]?.totalAmount || couponStats[0]?.totalSalesAmount || 0;
        const totalDiscount = totalStats[0]?.totalDiscount || couponStats[0]?.totalSalesDiscount || 0;
        const totalCoupons = couponStats[0]?.totalCoupons || 0;
        const usedCoupons = couponStats[0]?.usedCoupons || 0;
        const avgDiscountPercentage = couponStats[0]?.avgDiscountPercentage || 0;
        const avgDiscountPerCouponValue = avgDiscountPerCoupon[0]?.overallAvgDiscount || 0;
        const totalCouponsUsed = avgDiscountPerCoupon[0]?.totalCouponsUsed || 0;
        
        const redeemRate = totalCoupons > 0 ? (usedCoupons / totalCoupons) * 100 : 0;

        const stats = {
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
                totalAmount: parseFloat(totalAmount.toFixed(2)),
                totalDiscount: parseFloat(totalDiscount.toFixed(2)),
                totalCoupons,
                usedCoupons,
                remainingCoupons: totalCoupons - usedCoupons,
                avgDiscountPercentage: parseFloat(avgDiscountPercentage.toFixed(1)),
                avgDiscountPerCoupon: parseFloat(avgDiscountPerCouponValue.toFixed(2)),
                redeemRate: parseFloat(redeemRate.toFixed(1)),
                totalSales: totalStats[0]?.totalSales || 0,
                totalCouponsUsed
            }
        };

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching dashboard statistics",
            error: error.message
        });
    }
};

// Coupons List with Pagination and Date Filter
export const getCouponsList = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const { fromDate, toDate, status, search } = req.query;
        const skip = (page - 1) * limit;

        // Build date filter
        const dateFilter = buildDateFilter(fromDate, toDate);

        // Build status filter
        let statusFilter = {};
        if (status === 'active') {
            statusFilter.validTill = { $gte: new Date() };
        } else if (status === 'expired') {
            statusFilter.validTill = { $lt: new Date() };
        } else if (status === 'redeemed') {
            statusFilter.usedCopun = { $exists: true, $ne: [] };
        }

        // Build search filter
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

        const coupons = await Coupon.find(baseFilter)
            .populate('usedCopun', 'name email')
            .select('title validTill discountPercentage usedCopun consumersId shop_name copuon_srno createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalCoupons = await Coupon.countDocuments(baseFilter);

        // Format coupon data
        const formattedCoupons = coupons.map(coupon => {
            const baseAmount = coupon.consumersId?.length * 100 || 100;
            const discountPercentage = parseFloat(coupon.discountPercentage) || 0;
            const discountAmount = (baseAmount * discountPercentage) / 100;
            const isExpired = new Date(coupon.validTill) < new Date();
            const isRedeemed = coupon.usedCopun?.length > 0;

            return {
                id: coupon._id,
                title: coupon.title,
                shopName: coupon.shop_name,
                couponSerial: coupon.copuon_srno,
                validTill: coupon.validTill,
                discountPercentage: coupon.discountPercentage,
                amount: baseAmount,
                discountAmount: parseFloat(discountAmount.toFixed(2)),
                usedCount: coupon.usedCopun?.length || 0,
                totalDistributed: coupon.consumersId?.length || 0,
                status: isRedeemed ? "Redeemed" : isExpired ? "Expired" : "Active",
                createdAt: coupon.createdAt,
                isExpired,
                isRedeemed
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

// Enhanced PDF Export with Date Filter
export const exportDashboardPDF = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, period } = req.query;
        
        // Get dashboard stats with filters
        const statsReq = { user: { id: userId }, query: { fromDate, toDate, period } };
        const statsRes = {
            json: function(data) {
                this.statsData = data;
            }
        };
        
        await getDashboardStats(statsReq, statsRes);
        
        // Get coupons list with filters
        const couponsReq = { user: { id: userId }, query: { fromDate, toDate, limit: 1000 } };
        const couponsRes = {
            json: function(data) {
                this.couponsData = data;
            }
        };
        
        await getCouponsList(couponsReq, couponsRes);
        
        const partnerProfile = await PatnerProfile.findOne({ User_id: userId });
        const stats = statsRes.statsData.data;
        const coupons = couponsRes.couponsData.data.coupons;
        
        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="dashboard-report-${Date.now()}.pdf"`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Add header with logo and firm name
        doc.fontSize(16).text(stats.partnerInfo.firmName, 50, 50, { align: 'center' });
        
        if (stats.partnerInfo.city || stats.partnerInfo.state) {
            doc.fontSize(10).text(
                `${stats.partnerInfo.city}${stats.partnerInfo.city && stats.partnerInfo.state ? ', ' : ''}${stats.partnerInfo.state}`,
                50, 70, { align: 'center' }
            );
        }
        
        doc.fontSize(14).text('Dashboard Report', 50, 95, { align: 'center' });
        
        // Add filter information
        let filterText = 'All Time';
        if (fromDate && toDate) {
            filterText = `From ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()}`;
        } else if (period) {
            filterText = `Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`;
        }
        
        doc.fontSize(10).text(`Report Period: ${filterText}`, 50, 120);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 135);
        
        // Add overview statistics
        doc.fontSize(12).text('Overview Statistics', 50, 160);
        doc.moveDown(0.5);
        
        doc.fontSize(10);
        const overview = stats.overview;
        doc.text(`Total Amount: $${overview.totalAmount}`, 50, 190);
        doc.text(`Total Discount: $${overview.totalDiscount}`, 50, 205);
        doc.text(`Total Coupons: ${overview.totalCoupons}`, 50, 220);
        doc.text(`Used Coupons: ${overview.usedCoupons}`, 50, 235);
        doc.text(`Remaining Coupons: ${overview.remainingCoupons}`, 50, 250);
        doc.text(`Average Discount %: ${overview.avgDiscountPercentage}%`, 50, 265);
        doc.text(`Redeem Rate: ${overview.redeemRate}%`, 50, 280);
        doc.text(`Total Sales: ${overview.totalSales}`, 50, 295);
        
        // Add coupons list
        let yPosition = 330;
        doc.fontSize(12).text('Coupons List', 50, yPosition);
        yPosition += 30;
        
        coupons.forEach((coupon, index) => {
            if (yPosition > 700) {
                doc.addPage();
                yPosition = 50;
                // Add header on new page
                doc.fontSize(10).text(`Dashboard Report - ${stats.partnerInfo.firmName} - Page ${doc.bufferedPageRange().count}`, 50, 30);
            }
            
            doc.fontSize(9);
            doc.text(`${index + 1}. ${coupon.title}`, 50, yPosition);
            doc.text(`Shop: ${coupon.shopName} | Serial: ${coupon.couponSerial}`, 50, yPosition + 12);
            doc.text(`Valid Till: ${new Date(coupon.validTill).toLocaleDateString()}`, 50, yPosition + 24);
            doc.text(`Amount: $${coupon.amount} | Discount: $${coupon.discountAmount} (${coupon.discountPercentage}%)`, 50, yPosition + 36);
            doc.text(`Status: ${coupon.status} | Used: ${coupon.usedCount}/${coupon.totalDistributed}`, 50, yPosition + 48);
            
            yPosition += 70;
        });
        
        // Add summary
        if (yPosition > 600) {
            doc.addPage();
            yPosition = 50;
        }
        
        doc.fontSize(12).text('Summary', 50, yPosition);
        yPosition += 20;
        doc.fontSize(10);
        doc.text(`Total Coupons in Report: ${coupons.length}`, 50, yPosition);
        doc.text(`Report Period: ${filterText}`, 50, yPosition + 15);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, yPosition + 30);
        
        doc.end();
        
    } catch (error) {
        console.error("PDF export error:", error);
        res.status(500).json({
            success: false,
            message: "Error generating PDF report",
            error: error.message
        });
    }
};

// Sales Analytics with Date Range
export const getSalesAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromDate, toDate, groupBy = 'day' } = req.query; // groupBy: day, week, month
        
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
                groupFormat = { day: { $dayOfMonth: "$createdAt" }, month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
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
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.week": 1 } }
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