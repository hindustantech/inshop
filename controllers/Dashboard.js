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

    try {
        // Validate inputs
        if (!timestampField || typeof timestampField !== 'string') {
            timestampField = 'createdAt';
        }

        console.log('Building date filter with:', { fromDate, toDate, timestampField });

        if (fromDate && toDate) {
            const startDate = new Date(fromDate);
            const endDate = new Date(toDate);

            // Validate dates
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                console.error('Invalid dates provided:', { fromDate, toDate });
                return filter;
            }

            // Ensure start date is before end date
            if (startDate > endDate) {
                console.error('Start date cannot be after end date:', { startDate, endDate });
                return filter;
            }

            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            console.log('Final date range:', { startDate, endDate });

            filter[timestampField] = {
                $gte: startDate,
                $lte: endDate
            };
        } else if (fromDate) {
            const startDate = new Date(fromDate);
            if (isNaN(startDate.getTime())) {
                console.error('Invalid fromDate:', fromDate);
                return filter;
            }
            startDate.setHours(0, 0, 0, 0);
            filter[timestampField] = { $gte: startDate };
            console.log('From date filter:', { startDate });
        } else if (toDate) {
            const endDate = new Date(toDate);
            if (isNaN(endDate.getTime())) {
                console.error('Invalid toDate:', toDate);
                return filter;
            }
            endDate.setHours(23, 59, 59, 999);
            filter[timestampField] = { $lte: endDate };
            console.log('To date filter:', { endDate });
        }

        console.log('Final date filter:', filter);
        return filter;

    } catch (error) {
        console.error('Error building date filter:', error);
        return {};
    }
};

/**
 * Build period filter with proper date ranges and validation
 */
const buildPeriodFilter = (period, timestampField = 'createdAt') => {
    if (!period || typeof period !== 'string') {
        return {};
    }

    try {
        // Validate timestamp field
        if (!timestampField || typeof timestampField !== 'string') {
            timestampField = 'createdAt';
        }

        const startDate = new Date();
        const endDate = new Date();

        console.log('Building period filter:', { period, timestampField });

        switch (period.toLowerCase()) {
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
                endDate.setHours(23, 59, 59, 999);
                break;

            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;

            case 'last-two-months':
                startDate.setMonth(startDate.getMonth() - 2);
                startDate.setDate(1); // Start from 1st of that month
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;

            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;

            case 'all-time':
                // No date filter for all-time
                return {};

            default:
                console.warn('Unknown period provided:', period);
                return {};
        }

        // Validate the calculated dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error('Invalid dates calculated for period:', period);
            return {};
        }

        const periodFilter = {
            [timestampField]: {
                $gte: startDate,
                $lte: endDate
            }
        };

        console.log('Period filter result:', { period, startDate, endDate, filter: periodFilter });
        return periodFilter;

    } catch (error) {
        console.error('Error building period filter:', error);
        return {};
    }
};

/**
 * Enhanced helper to get date range label with validation
 */
const getDateRangeLabel = (fromDate, toDate, period) => {
    try {
        if (fromDate && toDate) {
            const from = new Date(fromDate);
            const to = new Date(toDate);

            if (isNaN(from.getTime()) || isNaN(to.getTime())) {
                return 'Invalid Date Range';
            }

            const fromStr = from.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const toStr = to.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            return `${fromStr} - ${toStr}`;
        }

        if (fromDate) {
            const from = new Date(fromDate);
            if (isNaN(from.getTime())) return 'Invalid Start Date';
            return `From ${from.toLocaleDateString('en-US')}`;
        }

        if (toDate) {
            const to = new Date(toDate);
            if (isNaN(to.getTime())) return 'Invalid End Date';
            return `Until ${to.toLocaleDateString('en-US')}`;
        }

        const periodLabels = {
            'today': 'Today',
            'yesterday': 'Yesterday',
            'week': 'Last 7 Days',
            'month': 'Last 30 Days',
            'last-two-months': 'Last Two Months',
            'year': 'Last Year',
            'all-time': 'All Time'
        };

        return periodLabels[period] || 'All Time';

    } catch (error) {
        console.error('Error generating date range label:', error);
        return 'Date Range';
    }
};

/**
 * Utility function to validate date string
 */
const isValidDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
};

/**
 * Utility to get date range for a period (useful for UI)
 */
const getDateRangeForPeriod = (period) => {
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
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'month':
            startDate.setMonth(startDate.getMonth() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'last-two-months':
            startDate.setMonth(startDate.getMonth() - 2);
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'year':
            startDate.setFullYear(startDate.getFullYear() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        default:
            return null;
    }

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        startDateObj: startDate,
        endDateObj: endDate
    };
};

/**
 * Enhanced build filter that combines both date and period filters
 */
const buildEnhancedDateFilter = (fromDate, toDate, period = 'all-time', timestampField = 'createdAt') => {
    try {
        let finalFilter = {};

        // Priority: Custom date range over period
        if (fromDate || toDate) {
            finalFilter = buildDateFilter(fromDate, toDate, timestampField);
        } else if (period && period !== 'all-time') {
            finalFilter = buildPeriodFilter(period, timestampField);
        }

        // Log for debugging
        console.log('Enhanced date filter result:', {
            fromDate,
            toDate,
            period,
            timestampField,
            finalFilter
        });

        return finalFilter;

    } catch (error) {
        console.error('Error in enhanced date filter:', error);
        return {};
    }
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
// ENHANCED COUPONS LIST CONTROLLER
// ==============================

export const getCouponsList = async (req, res) => {
    try {
        const userId = req?.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated"
            });
        }

        const {
            page = 1,
            limit = 10,
            fromDate,
            toDate,
            status,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query || {};

        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit), 100);
        const skip = (pageNum - 1) * limitNum;

        // Build filters
        const dateFilter = buildDateFilter(fromDate, toDate);

        let statusFilter = {};
        const now = new Date();

        // Enhanced status filtering with safe defaults
        if (status) {
            switch (status) {
                case 'active':
                    statusFilter = {
                        validTill: { $gte: now },
                        $expr: { $lt: ["$currentDistributions", "$maxDistributions"] },
                        active: true
                    };
                    break;
                case 'expired':
                    statusFilter = {
                        validTill: { $lt: now }
                    };
                    break;
                case 'fully-redeemed':
                    statusFilter = {
                        $expr: { $eq: ["$currentDistributions", "$maxDistributions"] }
                    };
                    break;
                case 'partially-redeemed':
                    statusFilter = {
                        $expr: {
                            $and: [
                                { $gt: ["$currentDistributions", 0] },
                                { $lt: ["$currentDistributions", "$maxDistributions"] }
                            ]
                        }
                    };
                    break;
                case 'inactive':
                    statusFilter = {
                        active: false
                    };
                    break;
                default:
                // No status filter
            }
        }

        // Enhanced search filter
        let searchFilter = {};
        if (search && search.trim() !== '') {
            searchFilter = {
                $or: [
                    { title: { $regex: search.trim(), $options: 'i' } },
                    { shop_name: { $regex: search.trim(), $options: 'i' } },
                    { copuon_srno: { $regex: search.trim(), $options: 'i' } },
                    { manul_address: { $regex: search.trim(), $options: 'i' } },
                    { "tag": { $in: [new RegExp(search.trim(), 'i')] } }
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

        // First, check if user has any coupons at all
        const totalUserCoupons = await Coupon.countDocuments({ ownerId: userId });

        if (totalUserCoupons === 0) {
            // No coupons found - return empty state response
            const emptyResponse = {
                success: true,
                data: {
                    coupons: [],
                    summary: {
                        totalCoupons: 0,
                        statusBreakdown: {
                            all: 0,
                            active: 0,
                            expired: 0,
                            fullyRedeemed: 0,
                            partiallyRedeemed: 0,
                            inactive: 0
                        },
                        totalActive: 0,
                        totalExpired: 0,
                        totalRedeemed: 0,
                        overallUtilization: 0
                    },
                    pagination: {
                        currentPage: pageNum,
                        totalPages: 0,
                        totalCoupons: 0,
                        hasNext: false,
                        hasPrev: false,
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
                    },
                    isEmpty: true,
                    message: "No coupons found. Create your first coupon to get started."
                }
            };
            return res.status(200).json(emptyResponse);
        }

        // Check if we have coupons for the selected filters
        const couponsWithFilters = await Coupon.countDocuments(baseFilter);

        if (couponsWithFilters === 0) {
            // No coupons match the current filters
            const noMatchResponse = {
                success: true,
                data: {
                    coupons: [],
                    summary: {
                        totalCoupons: 0,
                        statusBreakdown: {
                            all: 0,
                            active: 0,
                            expired: 0,
                            fullyRedeemed: 0,
                            partiallyRedeemed: 0,
                            inactive: 0
                        },
                        totalActive: 0,
                        totalExpired: 0,
                        totalRedeemed: 0,
                        overallUtilization: 0
                    },
                    pagination: {
                        currentPage: pageNum,
                        totalPages: 0,
                        totalCoupons: 0,
                        hasNext: false,
                        hasPrev: false,
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
                    },
                    isEmpty: true,
                    message: `No coupons found matching your filters. ${getFilterSuggestion(status, search, fromDate, toDate)}`
                }
            };
            return res.status(200).json(noMatchResponse);
        }

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

            // Get sales data for these coupons - FIXED: Added proper error handling
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
                        preserveNullAndEmptyArrays: false
                    }
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
                        totalRevenue: { $sum: { $ifNull: ["$amount", 0] } },
                        totalDiscount: { $sum: { $ifNull: ["$discountAmount", 0] } },
                        totalFinalAmount: { $sum: { $ifNull: ["$finalAmount", 0] } }
                    }
                }
            ]).catch(error => {
                console.error("Sales aggregation error:", error);
                return []; // Return empty array on error
            }),

            // Get status counts for filters - FIXED: Added proper error handling
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
            ]).catch(error => {
                console.error("Status counts aggregation error:", error);
                return [{}]; // Return empty object on error
            })
        ]);

        // Create sales map for quick lookup with safe defaults
        const salesMap = {};
        (salesData || []).forEach(sale => {
            if (sale && sale._id) {
                salesMap[sale._id.toString()] = {
                    totalSales: sale.totalSales || 0,
                    totalRevenue: sale.totalRevenue || 0,
                    totalDiscount: sale.totalDiscount || 0,
                    totalFinalAmount: sale.totalFinalAmount || 0
                };
            }
        });

        // Format coupon data with enhanced information and safe defaults
        const formattedCoupons = (coupons || []).map(coupon => {
            if (!coupon) return null;

            const baseAmount = (coupon.maxDistributions || 0) * 100; // Assuming 100 per distribution
            const discountPercentage = parseFloat(coupon.discountPercentage) || 0;
            const discountAmount = (baseAmount * discountPercentage) / 100;

            const couponSales = salesMap[coupon._id?.toString()] || {
                totalSales: 0,
                totalRevenue: 0,
                totalDiscount: 0,
                totalFinalAmount: 0
            };

            const status = getCouponStatus(
                coupon.validTill,
                coupon.currentDistributions || 0,
                coupon.maxDistributions || 0
            );

            const isExpired = new Date(coupon.validTill) < new Date();
            const isFullyRedeemed = (coupon.currentDistributions || 0) >= (coupon.maxDistributions || 0);
            const utilizationRate = calculateRedeemRate(coupon.currentDistributions || 0, coupon.maxDistributions || 0);

            return {
                id: coupon._id,
                title: coupon.title || 'Untitled Coupon',
                shopName: coupon.shop_name || 'No Shop Name',
                couponSerial: coupon.copuon_srno || 'N/A',
                manualAddress: coupon.manul_address || 'No Address',
                validTill: coupon.validTill,
                discountPercentage: discountPercentage,
                maxDistributions: coupon.maxDistributions || 0,
                currentDistributions: coupon.currentDistributions || 0,
                remainingDistributions: Math.max(0, (coupon.maxDistributions || 0) - (coupon.currentDistributions || 0)),
                amount: baseAmount,
                discountAmount: formatCurrency(discountAmount),
                usedCount: coupon.currentDistributions || 0,
                totalDistributed: coupon.maxDistributions || 0,
                salesData: {
                    totalSales: couponSales.totalSales,
                    totalRevenue: formatCurrency(couponSales.totalRevenue),
                    totalDiscount: formatCurrency(couponSales.totalDiscount),
                    totalFinalAmount: formatCurrency(couponSales.totalFinalAmount),
                    averageOrderValue: couponSales.totalSales > 0 ?
                        formatCurrency(couponSales.totalFinalAmount / couponSales.totalSales) : 0
                },
                status,
                isActive: coupon.active !== false, // Default to true if not specified
                isExpired,
                isFullyRedeemed,
                isSpecialCoupon: coupon.is_spacial_copun || false,
                couponColor: coupon.coupon_color || '#FFFFFF',
                tags: coupon.tag || [],
                categories: coupon.category || [],
                utilizationRate: formatCurrency(utilizationRate),
                daysUntilExpiry: isExpired ? 0 : Math.ceil((new Date(coupon.validTill) - now) / (1000 * 60 * 60 * 24)),
                createdAt: coupon.createdAt,
                updatedAt: coupon.updatedAt || coupon.createdAt
            };
        }).filter(coupon => coupon !== null); // Remove any null entries

        // Process status counts with safe defaults
        const statusCountsResult = statusCounts[0] || {};
        const statusSummary = {
            all: statusCountsResult.total?.[0]?.count || 0,
            active: statusCountsResult.active?.[0]?.count || 0,
            expired: statusCountsResult.expired?.[0]?.count || 0,
            fullyRedeemed: statusCountsResult.fullyRedeemed?.[0]?.count || 0,
            partiallyRedeemed: statusCountsResult.partiallyRedeemed?.[0]?.count || 0,
            inactive: statusCountsResult.inactive?.[0]?.count || 0
        };

        // Calculate overall utilization safely
        let overallUtilization = 0;
        if (formattedCoupons.length > 0) {
            const totalUtilization = formattedCoupons.reduce((sum, coupon) => {
                const maxDist = coupon.maxDistributions || 1; // Avoid division by zero
                const currentDist = coupon.currentDistributions || 0;
                return sum + (currentDist / maxDist) * 100;
            }, 0);
            overallUtilization = formatCurrency(totalUtilization / formattedCoupons.length);
        }

        const response = {
            success: true,
            data: {
                coupons: formattedCoupons,
                summary: {
                    totalCoupons: statusSummary.all,
                    statusBreakdown: statusSummary,
                    totalActive: statusSummary.active,
                    totalExpired: statusSummary.expired,
                    totalRedeemed: statusSummary.fullyRedeemed + statusSummary.partiallyRedeemed,
                    overallUtilization: overallUtilization
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
                },
                isEmpty: formattedCoupons.length === 0,
                message: formattedCoupons.length === 0 ?
                    "No coupons found matching your current filters." :
                    undefined
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error("Coupons list error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching coupons list",
            error: error.message,
            data: {
                coupons: [],
                summary: {
                    totalCoupons: 0,
                    statusBreakdown: {
                        all: 0,
                        active: 0,
                        expired: 0,
                        fullyRedeemed: 0,
                        partiallyRedeemed: 0,
                        inactive: 0
                    },
                    totalActive: 0,
                    totalExpired: 0,
                    totalRedeemed: 0,
                    overallUtilization: 0
                },
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalCoupons: 0,
                    hasNext: false,
                    hasPrev: false,
                    limit: 10
                },
                filters: {
                    fromDate: null,
                    toDate: null,
                    status: 'all',
                    search: '',
                    sortBy: 'createdAt',
                    sortOrder: 'desc',
                    dateRangeLabel: 'All Time'
                },
                isEmpty: true
            }
        });
    }
};

// Helper function for filter suggestions
const getFilterSuggestion = (status, search, fromDate, toDate) => {
    const suggestions = [];

    if (status && status !== 'all') {
        suggestions.push(`try changing the status filter from "${status}" to "all"`);
    }

    if (search) {
        suggestions.push(`try removing the search term "${search}"`);
    }

    if (fromDate || toDate) {
        suggestions.push('try adjusting the date range');
    }

    if (suggestions.length === 0) {
        return 'Try creating some coupons first.';
    }

    return `Suggestions: ${suggestions.join(' or ')}.`;
};

// ==============================
// FIXED DASHBOARD STATISTICS CONTROLLER
// ==============================
export const getDashboardStats = async (req, res) => {
    try {
        const userId = req?.user?.id;
        const { fromDate, toDate, period = 'all-time' } = req?.query || {};

        // Get partner profile
        const partnerProfile = await PatnerProfile.findOne({ User_id: userId });

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && period !== 'all-time' && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

        // First, check if user has any coupons at all
        const totalUserCoupons = await Coupon.countDocuments({ ownerId: userId });

        if (totalUserCoupons === 0) {
            // No coupons found - return empty state response
            const emptyResponse = {
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
                        // Zero values for all metrics
                        totalAmount: 0,
                        totalDiscount: 0,
                        totalFinalAmount: 0,
                        avgTransactionValue: 0,
                        totalCoupons: 0,
                        activeCoupons: 0,
                        expiredCoupons: 0,
                        totalMaxDistributions: 0,
                        totalCurrentDistributions: 0,
                        totalUsedCoupons: 0,
                        remainingDistributions: 0,
                        avgDiscountPercentage: 0,
                        redeemRate: 0,
                        salesConversionRate: 0,
                        totalSales: 0,
                        availableCoupons: 0,
                        usedCoupons: 0,
                        transferredCoupons: 0
                    },
                    topCoupons: [],
                    isEmpty: true,
                    message: "No coupons found. Create your first coupon to see analytics here."
                }
            };

            if (res?.status) {
                return res.status(200).json(emptyResponse);
            } else {
                return emptyResponse;
            }
        }

        // Check if we have data for the selected date range
        const couponsInRange = await Coupon.countDocuments({
            ownerId: userId,
            ...dateFilter
        });

        // Execute parallel queries only if we have data
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
                        shop_name: 1,
                        createdAt: 1
                    }
                }
            ])
        ]);

        // Check if we have any data in the selected range
        const hasDataInRange = couponsInRange > 0;

        // Extract values with fallbacks
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
                    totalAmount,
                    totalDiscount,
                    totalFinalAmount,
                    avgTransactionValue: formatCurrency(salesData.avgTransactionValue || 0),
                    totalCoupons,
                    activeCoupons,
                    expiredCoupons: totalCoupons - activeCoupons,
                    totalMaxDistributions,
                    totalCurrentDistributions,
                    totalUsedCoupons: usedCoupons,
                    remainingDistributions: Math.max(0, totalMaxDistributions - totalCurrentDistributions),
                    avgDiscountPercentage,
                    redeemRate: formatCurrency(redeemRate),
                    salesConversionRate: formatCurrency(salesConversionRate),
                    totalSales,
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
                    utilizationRate: calculateRedeemRate(coupon.currentDistributions, coupon.maxDistributions),
                    createdAt: coupon.createdAt
                })),
                isEmpty: !hasDataInRange,
                message: !hasDataInRange ?
                    "No data found for the selected date range. Try changing your filters or create new coupons." :
                    undefined
            }
        };

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

        // First, check if user has any coupons
        const totalUserCoupons = await Coupon.countDocuments({ ownerId: userId });

        if (totalUserCoupons === 0) {
            const emptyResponse = {
                success: true,
                data: {
                    overview: {
                        totalCoupons: 0,
                        activeCoupons: 0,
                        expiredCoupons: 0,
                        fullyRedeemed: 0,
                        totalDistributions: 0,
                        usedDistributions: 0,
                        remainingDistributions: 0,
                        avgDiscount: 0,
                        utilizationRate: 0,
                        totalPotentialRevenue: 0,
                        totalActualRevenue: 0,
                        revenueEfficiency: 0
                    },
                    statusDistribution: {},
                    filters: {
                        fromDate: fromDate || null,
                        toDate: toDate || null,
                        period,
                        dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
                    },
                    isEmpty: true,
                    message: "No coupons found. Create your first coupon to see analytics."
                }
            };

            if (res?.status) {
                return res.status(200).json(emptyResponse);
            } else {
                return emptyResponse;
            }
        }

        // Execute analytics queries with error handling
        const [analytics, couponStatus] = await Promise.all([
            // Main analytics aggregation
            Coupon.aggregate([
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
            ]).catch(error => {
                console.error("Analytics aggregation error:", error);
                return [{}];
            }),

            // Status distribution aggregation
            Coupon.aggregate([
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
            ]).catch(error => {
                console.error("Status distribution aggregation error:", error);
                return [];
            })
        ]);

        const data = analytics[0] || {};
        const statusDistribution = (couponStatus || []).reduce((acc, curr) => {
            if (curr?._id && curr?.count) {
                acc[curr._id] = curr.count;
            }
            return acc;
        }, {});

        // Check if we have data for the selected filters
        const hasDataInRange = data.totalCoupons > 0;

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
                },
                isEmpty: !hasDataInRange,
                message: !hasDataInRange ?
                    "No coupon data found for the selected date range. Try adjusting your filters." :
                    undefined
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
            error: error.message,
            data: {
                overview: {
                    totalCoupons: 0,
                    activeCoupons: 0,
                    expiredCoupons: 0,
                    fullyRedeemed: 0,
                    totalDistributions: 0,
                    usedDistributions: 0,
                    remainingDistributions: 0,
                    avgDiscount: 0,
                    utilizationRate: 0,
                    totalPotentialRevenue: 0,
                    totalActualRevenue: 0,
                    revenueEfficiency: 0
                },
                statusDistribution: {},
                filters: {
                    fromDate: null,
                    toDate: null,
                    period: 'all-time',
                    dateRangeLabel: 'All Time'
                },
                isEmpty: true
            }
        };

        if (res?.status) {
            return res.status(500).json(errorResponse);
        } else {
            return errorResponse;
        }
    }
};

// ==============================
// ENHANCED PDF EXPORT CONTROLLER
// ==============================

export const exportDashboardPDF = async (req, res) => {
    req.socket.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated"
            });
        }

        const { fromDate, toDate, period = 'all-time' } = req.query || {};

        // Prepare mock request for analytics functions
        const mockReq = {
            user: { id: userId },
            query: { fromDate, toDate, period }
        };

        // Parallel fetch of all report data with error handling
        const [partnerProfile, statsRes, salesRes, couponsRes] = await Promise.all([
            PatnerProfile.findOne({ User_id: userId }).catch(() => null),
            getDashboardStats(mockReq).catch(error => ({
                success: false,
                message: "Failed to fetch dashboard stats",
                error: error.message
            })),
            getSalesAnalytics(mockReq).catch(error => ({
                success: false,
                message: "Failed to fetch sales analytics",
                error: error.message
            })),
            getCouponsAnalytics(mockReq).catch(error => ({
                success: false,
                message: "Failed to fetch coupons analytics",
                error: error.message
            }))
        ]);

        // Check if any of the responses failed
        if (!statsRes.success || !salesRes.success || !couponsRes.success) {
            const errorMessages = [
                !statsRes.success && statsRes.message,
                !salesRes.success && salesRes.message,
                !couponsRes.success && couponsRes.message
            ].filter(Boolean).join(', ');

            throw new Error(`Failed to fetch data for PDF generation: ${errorMessages}`);
        }

        const stats = statsRes.data || {};
        const salesData = salesRes.data || {};
        const couponsData = couponsRes.data || {};

        // Check if we have any data to export
        if (stats.isEmpty && salesData.analytics?.length === 0 && couponsData.overview?.totalCoupons === 0) {
            return res.status(404).json({
                success: false,
                message: "No data available to generate PDF report"
            });
        }

        // Initialize the PDF
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true,
            info: {
                Title: `${stats.partnerInfo?.firmName || 'Business'} - Performance Analytics Report`,
                Author: 'Partner Analytics Dashboard',
                CreationDate: new Date(),
                Subject: 'Comprehensive Business Performance Analysis'
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${(stats.partnerInfo?.firmName || 'Report').replace(/[^a-zA-Z0-9]/g, '_')}_Analytics_Report_${new Date().toISOString().slice(0, 10)}.pdf"`
        );

        doc.pipe(res);

        // 🎨 Brand Colors
        const colors = {
            primary: '#1A237E',
            secondary: '#3949AB',
            accent: '#64B5F6',
            text: '#2C3E50',
            light: '#F4F6F8',
            border: '#E0E0E0',
            warning: '#FF9800',
            empty: '#9E9E9E'
        };

        // 📘 Add Header
        const addHeader = () => {
            doc.rect(0, 0, doc.page.width, 100)
                .fill(colors.primary);

            doc.fillColor('#ffffff')
                .font('Helvetica-Bold')
                .fontSize(22)
                .text(stats.partnerInfo?.firmName || 'Your Business', 50, 35);

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
        const addMetricCard = (x, y, title, value, subtext, isEmpty = false) => {
            const width = 230, height = 70;

            doc.rect(x, y, width, height)
                .fillColor(isEmpty ? colors.empty : colors.light)
                .strokeColor(colors.border)
                .lineWidth(1)
                .fillAndStroke();

            doc.fillColor(isEmpty ? colors.empty : colors.primary)
                .font('Helvetica-Bold')
                .fontSize(isEmpty ? 12 : 14)
                .text(isEmpty ? 'No Data' : value, x + 10, y + 15);

            doc.fillColor(isEmpty ? colors.empty : colors.text)
                .font('Helvetica')
                .fontSize(10)
                .text(title, x + 10, y + 35);

            if (subtext && !isEmpty)
                doc.fillColor(colors.accent)
                    .fontSize(9)
                    .text(subtext, x + 10, y + 50);
        };

        // 📊 Table Generator
        const addTable = (headers, rows, emptyMessage = "No data available") => {
            const startX = 50;
            let y = doc.y + 10;
            const columnWidth = (doc.page.width - 100) / headers.length;

            if (!rows || rows.length === 0) {
                doc.fillColor(colors.empty)
                    .font('Helvetica-Italic')
                    .fontSize(11)
                    .text(emptyMessage, startX, y);
                doc.moveDown(2);
                return;
            }

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
                if (y > 700) {
                    doc.addPage();
                    addHeader();
                    addSectionHeader('Continued...');
                    y = 150;
                }

                headers.forEach((h, i) => {
                    doc.text(row[h] || '', startX + i * columnWidth, y, { width: columnWidth, align: 'left' });
                });
                y += 15;

                if (idx < rows.length - 1) {
                    doc.moveTo(startX, y - 3)
                        .lineTo(doc.page.width - 50, y - 3)
                        .strokeColor(colors.border)
                        .lineWidth(0.3)
                        .stroke();
                }
            });
            doc.moveDown(2);
        };

        // Add Empty State Message
        const addEmptyState = (message) => {
            doc.fillColor(colors.empty)
                .font('Helvetica-Italic')
                .fontSize(12)
                .text(message, { align: 'center' });
            doc.moveDown(2);
        };

        // Add main header
        addHeader();

        // 🧩 EXECUTIVE SUMMARY
        addSectionHeader('Executive Summary');

        if (stats.isEmpty) {
            addEmptyState("No analytics data available. Create coupons and generate sales to see insights here.");
        } else {
            const metrics = [
                {
                    title: 'Total Revenue',
                    value: `₹${stats.overview?.totalFinalAmount || 0}`,
                    sub: `${stats.overview?.totalSales || 0} sales`,
                    isEmpty: !stats.overview?.totalFinalAmount
                },
                {
                    title: 'Total Discount',
                    value: `₹${stats.overview?.totalDiscount || 0}`,
                    sub: `${calculateRedeemRate(stats.overview?.totalDiscount || 0, stats.overview?.totalAmount || 1).toFixed(1)}% of total`,
                    isEmpty: !stats.overview?.totalDiscount
                },
                {
                    title: 'Active Coupons',
                    value: stats.overview?.activeCoupons || 0,
                    sub: `${stats.overview?.totalCoupons || 0} total`,
                    isEmpty: !stats.overview?.activeCoupons
                },
                {
                    title: 'Redeem Rate',
                    value: `${stats.overview?.redeemRate || 0}%`,
                    sub: `${stats.overview?.totalCurrentDistributions || 0}/${stats.overview?.totalMaxDistributions || 0}`,
                    isEmpty: !stats.overview?.redeemRate
                }
            ];

            // 2x2 Grid layout
            let y = doc.y;
            metrics.forEach((m, i) => {
                const x = 50 + (i % 2) * 250;
                const rowY = y + Math.floor(i / 2) * 85;
                addMetricCard(x, rowY, m.title, m.value, m.sub, m.isEmpty);
            });

            doc.y = y + 190;
        }

        // 📈 SALES PERFORMANCE
        addSectionHeader('Sales Performance');
        addTable(
            ['Date', 'Transactions', 'Revenue', 'Discount', 'Avg. Order'],
            (salesData.analytics || []).slice(0, 10).map(item => ({
                'Date': item.label || 'N/A',
                'Transactions': item.totalSales || 0,
                'Revenue': `₹${item.totalFinalAmount || 0}`,
                'Discount': `₹${item.totalDiscount || 0}`,
                'Avg. Order': `₹${item.averageOrderValue || 0}`
            })),
            "No sales data available for the selected period"
        );

        // 🎟️ COUPON PERFORMANCE
        addSectionHeader('Coupon Performance');
        addTable(
            ['Coupon', 'Distributed', 'Used', 'Utilization', 'Status'],
            (stats.topCoupons || []).map(coupon => ({
                'Coupon': coupon.title || 'Untitled',
                'Distributed': coupon.maxDistributions || 0,
                'Used': coupon.currentDistributions || 0,
                'Utilization': `${(coupon.utilizationRate || 0).toFixed(1)}%`,
                'Status': (coupon.utilizationRate || 0) > 80 ? 'High' : (coupon.utilizationRate || 0) > 50 ? 'Medium' : 'Low'
            })),
            "No coupon performance data available"
        );

        // 🧠 PERFORMANCE INSIGHTS
        addSectionHeader('Performance Insights');

        if (stats.isEmpty) {
            addEmptyState("Create coupons and generate sales activity to see performance insights here.");
        } else {
            const insights = [
                `• Total Revenue Generated: ₹${stats.overview?.totalFinalAmount || 0}`,
                `• Completed Transactions: ${stats.overview?.totalSales || 0}`,
                `• Discount Given: ₹${stats.overview?.totalDiscount || 0}`,
                `• Active Campaigns: ${stats.overview?.activeCoupons || 0}`,
                `• Coupon Redemption Rate: ${stats.overview?.redeemRate || 0}%`
            ];

            insights.forEach(i => {
                doc.fillColor(colors.text)
                    .fontSize(10)
                    .text(i, { lineGap: 3 });
            });
        }

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
                `Confidential - ${stats.partnerInfo?.firmName || 'Business Report'}`,
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
        const userId = req?.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated"
            });
        }

        const { fromDate, toDate, period = 'all-time' } = req.query || {};

        // Build date filters
        let dateFilter = buildDateFilter(fromDate, toDate);
        if (period && period !== 'all-time' && !fromDate && !toDate) {
            dateFilter = { ...dateFilter, ...buildPeriodFilter(period) };
        }

        // First, check if user has any user coupons
        const totalUserCoupons = await UserCoupon.countDocuments();

        if (totalUserCoupons === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    statusBreakdown: [],
                    timeline: [],
                    summary: {
                        totalUserCoupons: 0,
                        uniqueUsers: 0,
                        totalValue: 0,
                        usageRate: 0
                    },
                    filters: {
                        fromDate: fromDate || null,
                        toDate: toDate || null,
                        period,
                        dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
                    },
                    isEmpty: true,
                    message: "No user coupon data found. Users need to claim your coupons first."
                }
            });
        }

        // Execute analytics queries with error handling
        const [analytics, timelineData] = await Promise.all([
            // Status breakdown analytics
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
            ]).catch(error => {
                console.error("User coupons analytics aggregation error:", error);
                return [];
            }),

            // Timeline data
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
            ]).catch(error => {
                console.error("User coupons timeline aggregation error:", error);
                return [];
            })
        ]);

        // Check if we have data for the selected filters
        const hasDataInRange = analytics.length > 0 || timelineData.length > 0;

        const response = {
            success: true,
            data: {
                statusBreakdown: analytics || [],
                timeline: timelineData || [],
                summary: {
                    totalUserCoupons: (analytics || []).reduce((sum, item) => sum + (item.count || 0), 0),
                    uniqueUsers: (analytics || []).reduce((sum, item) => sum + (item.uniqueUsers || 0), 0),
                    totalValue: formatCurrency((analytics || []).reduce((sum, item) => sum + (item.totalValue || 0), 0)),
                    usageRate: calculateRedeemRate(
                        (analytics || []).find(item => item.status === 'used')?.count || 0,
                        (analytics || []).reduce((sum, item) => sum + (item.count || 0), 0)
                    )
                },
                filters: {
                    fromDate: fromDate || null,
                    toDate: toDate || null,
                    period,
                    dateRangeLabel: getDateRangeLabel(fromDate, toDate, period)
                },
                isEmpty: !hasDataInRange,
                message: !hasDataInRange ?
                    "No user coupon data found for the selected date range." :
                    undefined
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error("User coupons analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user coupons analytics",
            error: error.message,
            data: {
                statusBreakdown: [],
                timeline: [],
                summary: {
                    totalUserCoupons: 0,
                    uniqueUsers: 0,
                    totalValue: 0,
                    usageRate: 0
                },
                filters: {
                    fromDate: null,
                    toDate: null,
                    period: 'all-time',
                    dateRangeLabel: 'All Time'
                },
                isEmpty: true
            }
        });
    }
};