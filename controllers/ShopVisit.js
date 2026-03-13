import ShopVisit from "../models/ShopVisit.js";
import Coupon from "../models/coupunModel.js";
import Banner from "../models/Banner.js";
import Attendance from "../models/Attandance/Attendance.js";
import User from "../models/userModel.js";
/**
 * Create a new shop visit
 * @route POST /api/shop-visits
 * @access Private (Sales Rep)
 */


export const searchcouopn = async (req, res) => {
    try {
        const { q = "", page = 1, limit = 10 } = req.query;

        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        const searchConditions = [];

        if (q) {
            searchConditions.push(
                { couponName: { $regex: q, $options: "i" } },
                { coupon_name: { $regex: q, $options: "i" } },
                { title: { $regex: q, $options: "i" } },
                { copuon_srno: { $regex: q, $options: "i" } },
                { owner_phone: { $regex: q, $options: "i" } }
            );
        }

        const filter = {
            active: true,
            approveowner: true,
            status: "published",
            ...(searchConditions.length > 0 && { $or: searchConditions })
        };

        const [coupons, total] = await Promise.all([
            Coupon.find(filter)
                .populate("category", "name")
                .populate("promotion", "title")
                .populate("ownerId", "name phone email")
                .sort({ creationDate: -1 })
                .skip(skip)
                .limit(limitNumber)
                .lean(),

            Coupon.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            message: "Coupons fetched successfully",
            pagination: {
                total,
                page: pageNumber,
                limit: limitNumber,
                totalPages: Math.ceil(total / limitNumber)
            },
            data: coupons
        });

    } catch (error) {
        console.error("Coupon search error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

export const createShopVisit = async (req, res) => {
    try {
        const {
            visitDate,
            shopName,
            shopAddress,
            area,
            phoneNumber,
            category,
            convertedToBusiness,
            couponId,
            bannerId,
            attendanceId,
            revenueGenerated
        } = req.body;

        // Get the current user from the request (assuming auth middleware adds user)
        const visitedBy = req.user._id;

        // Validate that the user exists and is a sales rep
        const user = await User.findById(visitedBy);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // If convertedToBusiness is true, validate that at least one source is provided
        if (convertedToBusiness) {
            if (!couponId && !bannerId && !attendanceId) {
                return res.status(400).json({
                    success: false,
                    message: "When marking as converted to business, at least one source (couponId, bannerId, or attendanceId) is required"
                });
            }

            // Validate the provided IDs exist in their respective collections
            if (couponId) {
                const coupon = await Coupon.findById(couponId);
                if (!coupon) {
                    return res.status(404).json({
                        success: false,
                        message: "Coupon not found"
                    });
                }
            }

            if (bannerId) {
                const banner = await Banner.findById(bannerId);
                if (!banner) {
                    return res.status(404).json({
                        success: false,
                        message: "Banner not found"
                    });
                }
            }

            if (attendanceId) {
                const attendance = await Attendance.findById(attendanceId);
                if (!attendance) {
                    return res.status(404).json({
                        success: false,
                        message: "Attendance record not found"
                    });
                }
            }
        }

        // Check if phone number is already used in another shop visit
        const existingShopVisit = await ShopVisit.findOne({ phoneNumber });
        if (existingShopVisit) {
            return res.status(409).json({
                success: false,
                message: "A shop with this phone number already exists",
                existingShopVisit: {
                    id: existingShopVisit._id,
                    shopName: existingShopVisit.shopName,
                    area: existingShopVisit.area,
                    visitDate: existingShopVisit.visitDate
                }
            });
        }

        // Create new shop visit
        const newShopVisit = new ShopVisit({
            visitDate: visitDate || new Date(),
            shopName,
            shopAddress,
            area,
            phoneNumber,
            category,
            convertedToBusiness: convertedToBusiness || false,
            couponId,
            bannerId,
            attendanceId,
            visitedBy,
            revenueGenerated: revenueGenerated || 0
        });

        // Save to database
        await newShopVisit.save();

        res.status(201).json({
            success: true,
            message: "Shop visit created successfully",
            data: newShopVisit
        });

    } catch (error) {
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: messages
            });
        }

        // Handle duplicate key error (if phone number has a unique index)
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Duplicate entry. A shop visit with this phone number already exists"
            });
        }

        // Handle other errors
        console.error("Error creating shop visit:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

