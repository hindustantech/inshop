import ShopVisit from "../models/ShopVisit.js";
import Coupon from "../models/coupunModel.js";
import Banner from "../models/Banner.js";
import Attendance from "../models/Attandance/Attendance.js";
import User from "../models/userModel.js";
import Category from "../models/CategoryCopun.js";
import { Parser } from "json2csv";
import mongoose from "mongoose";
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




// 📝 Create a new shop visit
export const createShopVisit = async (req, res) => {
  try {
    const {
      visitDate,
      visited,
      shopName,
      address,
      area,
      phone,
      category,
      convertedToBusiness,
      conversionDate,
      campaign,
      revenue,
      currency,
      meta,
      status,
    } = req.body;

    // Validate required fields
    if (!shopName || !address || !area || !phone) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: shopName, address, area, phone are required",
      });
    }

    // Validate phone number format
    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format. Must be 10 digits",
      });
    }

    // Validate category if provided
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: "Category not found",
        });
      }
    }

    // Validate coupon if provided
    if (campaign?.couponId) {
      const couponExists = await Coupon.findById(campaign.couponId);
      if (!couponExists) {
        return res.status(400).json({
          success: false,
          message: "Coupon not found",
        });
      }
    }

    // Validate banner if provided
    if (campaign?.bannerId) {
      const bannerExists = await Banner.findById(campaign.bannerId);
      if (!bannerExists) {
        return res.status(400).json({
          success: false,
          message: "Banner not found",
        });
      }
    }

    // Create shop visit with createdby from middleware (assigned user)
    const shopVisit = await ShopVisit.create({
      visitDate: visitDate || new Date(),
      visited: visited || false,
      shopName,
      address,
      area,
      phone,
      category: category || null,
      convertedToBusiness: convertedToBusiness || false,
      conversionDate: conversionDate || null,
      campaign: {
        couponId: campaign?.couponId || null,
        bannerId: campaign?.bannerId || null,
        source: campaign?.source || "organic",
      },
      revenue: revenue || 0,
      currency: currency || "INR",
      meta: {
        deviceType: meta?.deviceType || req.headers["user-agent"],
        appVersion: meta?.appVersion,
        ipAddress: meta?.ipAddress || req.ip,
        geo: meta?.geo || {},
      },
      assignedTo: req.user?._id || null, // From auth middleware
      createdby: req.user?._id, // From auth middleware
      status: status || "lead",
    });

    // Populate references for response
    const populatedShopVisit = await ShopVisit.findById(shopVisit._id)
      .populate("category", "name")
      .populate("campaign.couponId", "code discount")
      .populate("campaign.bannerId", "name imageUrl")
      .populate("assignedTo", "name email")
      .populate("createdby", "name email");

    res.status(201).json({
      success: true,
      data: populatedShopVisit,
      message: "Shop visit created successfully",
    });
  } catch (error) {
    console.error("Error creating shop visit:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create shop visit",
      error: error.message,
    });
  }
};

// 📋 Get all shop visits with filters and pagination
export const getAllShopVisits = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      area,
      category,
      status,
      convertedToBusiness,
      visited,
      startDate,
      endDate,
      search,
      createdBy,
      assignedTo,
    } = req.query;

    // Build filter object
    const filter = {};

    if (area) filter.area = area;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (convertedToBusiness !== undefined) filter.convertedToBusiness = convertedToBusiness === "true";
    if (visited !== undefined) filter.visited = visited === "true";
    if (createdBy) filter.createdby = createdBy;
    if (assignedTo) filter.assignedTo = assignedTo;

    // Date range filter
    if (startDate || endDate) {
      filter.visitDate = {};
      if (startDate) filter.visitDate.$gte = new Date(startDate);
      if (endDate) filter.visitDate.$lte = new Date(endDate);
    }

    // Search in shopName and phone
    if (search) {
      filter.$or = [
        { shopName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Execute queries
    const [shopVisits, totalCount] = await Promise.all([
      ShopVisit.find(filter)
        .populate("category", "name")
        .populate("campaign.couponId", "code discount type")
        .populate("campaign.bannerId", "name imageUrl")
        .populate("assignedTo", "name email role")
        .populate("createdby", "name email role")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      ShopVisit.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: shopVisits,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching shop visits:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shop visits",
      error: error.message,
    });
  }
};

// 📄 Export shop visits to CSV
export const exportShopVisitsToCSV = async (req, res) => {
  try {
    const {
      area,
      category,
      status,
      convertedToBusiness,
      visited,
      startDate,
      endDate,
      search,
      createdBy,
      assignedTo,
    } = req.query;

    // Build filter object (same as getAllShopVisits)
    const filter = {};

    if (area) filter.area = area;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (convertedToBusiness !== undefined) filter.convertedToBusiness = convertedToBusiness === "true";
    if (visited !== undefined) filter.visited = visited === "true";
    if (createdBy) filter.createdby = createdBy;
    if (assignedTo) filter.assignedTo = assignedTo;

    if (startDate || endDate) {
      filter.visitDate = {};
      if (startDate) filter.visitDate.$gte = new Date(startDate);
      if (endDate) filter.visitDate.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { shopName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Fetch all matching records
    const shopVisits = await ShopVisit.find(filter)
      .populate("category", "name")
      .populate("campaign.couponId", "code discount type")
      .populate("campaign.bannerId", "name imageUrl")
      .populate("assignedTo", "name email")
      .populate("createdby", "name email")
      .lean();

    // Transform data for CSV
    const csvData = shopVisits.map(visit => ({
      "Visit ID": visit._id,
      "Visit Date": visit.visitDate ? new Date(visit.visitDate).toLocaleString() : "",
      "Visited": visit.visited ? "Yes" : "No",
      "Shop Name": visit.shopName,
      "Address": visit.address,
      "Area": visit.area,
      "Phone": visit.phone,
      "Category": visit.category?.name || "",
      "Converted to Business": visit.convertedToBusiness ? "Yes" : "No",
      "Conversion Date": visit.conversionDate ? new Date(visit.conversionDate).toLocaleString() : "",
      "Campaign Source": visit.campaign?.source || "",
      "Coupon Code": visit.campaign?.couponId?.code || "",
      "Coupon Discount": visit.campaign?.couponId?.discount || "",
      "Banner Name": visit.campaign?.bannerId?.name || "",
      "Revenue": visit.revenue,
      "Currency": visit.currency,
      "Status": visit.status,
      "Device Type": visit.meta?.deviceType || "",
      "IP Address": visit.meta?.ipAddress || "",
      "Created By": visit.createdby?.name || visit.createdby?.email || "",
      "Assigned To": visit.assignedTo?.name || visit.assignedTo?.email || "",
      "Created At": visit.createdAt ? new Date(visit.createdAt).toLocaleString() : "",
      "Updated At": visit.updatedAt ? new Date(visit.updatedAt).toLocaleString() : "",
    }));

    // Define CSV fields
    const fields = [
      "Visit ID",
      "Visit Date",
      "Visited",
      "Shop Name",
      "Address",
      "Area",
      "Phone",
      "Category",
      "Converted to Business",
      "Conversion Date",
      "Campaign Source",
      "Coupon Code",
      "Coupon Discount",
      "Banner Name",
      "Revenue",
      "Currency",
      "Status",
      "Device Type",
      "IP Address",
      "Created By",
      "Assigned To",
      "Created At",
      "Updated At",
    ];

    // Create CSV parser
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(csvData);

    // Set response headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=shop-visits-${new Date().toISOString()}.csv`
    );

    res.status(200).send(csv);
  } catch (error) {
    console.error("Error exporting shop visits:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export shop visits",
      error: error.message,
    });
  }
};

// 🔍 Get single shop visit by ID
export const getShopVisitById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop visit ID",
      });
    }

    const shopVisit = await ShopVisit.findById(id)
      .populate("category", "name description")
      .populate("campaign.couponId", "code discount type expiryDate")
      .populate("campaign.bannerId", "name imageUrl description")
      .populate("assignedTo", "name email role")
      .populate("createdby", "name email role");

    if (!shopVisit) {
      return res.status(404).json({
        success: false,
        message: "Shop visit not found",
      });
    }

    res.status(200).json({
      success: true,
      data: shopVisit,
    });
  } catch (error) {
    console.error("Error fetching shop visit:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shop visit",
      error: error.message,
    });
  }
};

// ✏️ Update shop visit
export const updateShopVisit = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop visit ID",
      });
    }

    const {
      visitDate,
      visited,
      shopName,
      address,
      area,
      phone,
      category,
      convertedToBusiness,
      conversionDate,
      campaign,
      revenue,
      currency,
      meta,
      status,
      assignedTo,
    } = req.body;

    // Validate phone if being updated
    if (phone && !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format. Must be 10 digits",
      });
    }

    // Build update object
    const updateData = {};

    if (visitDate !== undefined) updateData.visitDate = visitDate;
    if (visited !== undefined) updateData.visited = visited;
    if (shopName !== undefined) updateData.shopName = shopName;
    if (address !== undefined) updateData.address = address;
    if (area !== undefined) updateData.area = area;
    if (phone !== undefined) updateData.phone = phone;
    if (category !== undefined) updateData.category = category;
    if (convertedToBusiness !== undefined) updateData.convertedToBusiness = convertedToBusiness;
    if (conversionDate !== undefined) updateData.conversionDate = conversionDate;
    if (revenue !== undefined) updateData.revenue = revenue;
    if (currency !== undefined) updateData.currency = currency;
    if (status !== undefined) updateData.status = status;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    
    if (campaign) {
      updateData["campaign.couponId"] = campaign.couponId;
      updateData["campaign.bannerId"] = campaign.bannerId;
      updateData["campaign.source"] = campaign.source;
    }
    
    if (meta) {
      if (meta.deviceType) updateData["meta.deviceType"] = meta.deviceType;
      if (meta.appVersion) updateData["meta.appVersion"] = meta.appVersion;
      if (meta.ipAddress) updateData["meta.ipAddress"] = meta.ipAddress;
      if (meta.geo) updateData["meta.geo"] = meta.geo;
    }

    const updatedShopVisit = await ShopVisit.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("category", "name")
      .populate("campaign.couponId", "code discount")
      .populate("campaign.bannerId", "name imageUrl")
      .populate("assignedTo", "name email")
      .populate("createdby", "name email");

    if (!updatedShopVisit) {
      return res.status(404).json({
        success: false,
        message: "Shop visit not found",
      });
    }

    res.status(200).json({
      success: true,
      data: updatedShopVisit,
      message: "Shop visit updated successfully",
    });
  } catch (error) {
    console.error("Error updating shop visit:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update shop visit",
      error: error.message,
    });
  }
};

// 🗑️ Delete shop visit
export const deleteShopVisit = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop visit ID",
      });
    }

    const deletedShopVisit = await ShopVisit.findByIdAndDelete(id);

    if (!deletedShopVisit) {
      return res.status(404).json({
        success: false,
        message: "Shop visit not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Shop visit deleted successfully",
      data: deletedShopVisit,
    });
  } catch (error) {
    console.error("Error deleting shop visit:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete shop visit",
      error: error.message,
    });
  }
};

// 📊 Get statistics
export const getShopVisitStats = async (req, res) => {
  try {
    const stats = await ShopVisit.aggregate([
      {
        $group: {
          _id: null,
          totalVisits: { $sum: 1 },
          totalConverted: { $sum: { $cond: ["$convertedToBusiness", 1, 0] } },
          totalRevenue: { $sum: "$revenue" },
          totalVisited: { $sum: { $cond: ["$visited", 1, 0] } },
          avgRevenue: { $avg: "$revenue" },
        },
      },
    ]);

    const statusBreakdown = await ShopVisit.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const areaBreakdown = await ShopVisit.aggregate([
      {
        $group: {
          _id: "$area",
          count: { $sum: 1 },
          revenue: { $sum: "$revenue" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalVisits: 0,
          totalConverted: 0,
          totalRevenue: 0,
          totalVisited: 0,
          avgRevenue: 0,
        },
        statusBreakdown,
        topAreas: areaBreakdown,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
};