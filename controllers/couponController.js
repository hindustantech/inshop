import Coupon from '../models/coupunModel.js';
import User from '../models/userModel.js';
import UserCoupon from '../models/UserCoupon.js';
import Salses from '../models/Sales.js'
import ManualAddress from '../models/ManualAddress.js';
import { uploadToCloudinary } from '../utils/Cloudinary.js';
import mongoose from 'mongoose';
import Category from '../models/CategoryCopun.js';
import { exportToCSV } from '../utils/exportcsv.js';
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import admin from '../utils/firebaseadmin.js'

const statesAndUTs = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep',
  'Delhi',
  'Puducherry',
  'Ladakh',
  'Jammu and Kashmir'
];


const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key"; // keep this secret in env

export const generateTheQRCode = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user || user.type !== "partner") {
      return res.status(404).json({
        success: false,
        message: "User not found or not a partner"
      });
    }

    // Generate a JWT token that expires in 10 minutes
    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      // { expiresIn: "10m" } // 10 minutes
    );

    // Generate QR code from the token
    const qrCodeUrl = await QRCode.toDataURL(token);

    return res.status(200).json({
      success: true,
      message: "QR Code generated successfully",
      data: { qrCodeUrl }
    });

  } catch (error) {
    console.error("Error generating QR code:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating QR code",
      error: error.message
    });
  }
};


// ✅ Admin update route
export const updateCouponByAdmin = async (req, res) => {
  try {
    const { couponId } = req.params;
    const { maxDistributions, fromTime, toTime, active, validTill } = req.body;

    // ✅ Allow only these fields
    const allowedUpdates = {};
    if (maxDistributions !== undefined) allowedUpdates.maxDistributions = maxDistributions;
    if (fromTime !== undefined) allowedUpdates.fromTime = fromTime;
    if (toTime !== undefined) allowedUpdates.toTime = toTime;
    if (active !== undefined) allowedUpdates.active = active;
    if (validTill !== undefined) {
      // validate that validTill is a valid future date
      if (new Date(validTill) <= new Date()) {
        return res.status(400).json({ error: "validTill must be a future date." });
      }
      allowedUpdates.validTill = new Date(validTill);
    }

    // ✅ Update coupon with only allowed fields
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    res.status(200).json({
      message: "Coupon updated successfully by admin",
      coupon: updatedCoupon
    });

  } catch (error) {
    console.error("Admin coupon update error:", error);
    res.status(500).json({ error: "Server error while updating coupon" });
  }
};


// helper for image upload
export const createCoupon = async (req, res) => {
  try {
    const {
      shop_name,
      coupon_color,
      title,
      manual_address,
      copuon_srno,
      categoryIds,   // ✅ now expecting array of category IDs
      discountPercentage,
      validTill,
      style,
      maxDistributions = 0,
      fromTime,
      toTime,
      isFullDay = false,
      termsAndConditions,
      is_spacial_copun = false,
      isTransferable = false,
      tag,
      shope_location,
    } = req.body;

    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: user missing" });
    }

    const { createdBy, ownerId, partnerId } = req.ownership || {};

    // ------------------ Validations ------------------
    // if (
    //   !title?.trim() ||
    //   !manual_address?.trim() ||
    //   !copuon_srno?.trim() ||
    //   !Array.isArray(categoryIds) ||
    //   categoryIds.length === 0 ||
    //   isNaN(parseFloat(discountPercentage)) ||
    //   !validTill?.trim() ||
    //   !termsAndConditions?.trim()
    // ) {
    //   return res.status(400).json({
    //     message:
    //       "Missing/Invalid fields: title, manual_address, copuon_srno, categoryIds[], discountPercentage, validTill, termsAndConditions",
    //   });
    // }

    // Parse discountPercentage
    const parsedDiscount = parseFloat(discountPercentage);
    if (parsedDiscount < 0 || parsedDiscount > 100) {
      return res.status(400).json({ message: "discountPercentage must be between 0 and 100" });
    }

    // Validate shope_location
    let location = null;
    if (!shope_location) {
      return res.status(400).json({ message: "shope_location is required" });
    }
    try {
      const parsedLocation = typeof shope_location === "string"
        ? JSON.parse(shope_location)
        : shope_location;

      if (
        parsedLocation.type !== "Point" ||
        !Array.isArray(parsedLocation.coordinates) ||
        parsedLocation.coordinates.length !== 2 ||
        isNaN(parsedLocation.coordinates[0]) ||
        isNaN(parsedLocation.coordinates[1]) ||
        !parsedLocation.address?.trim()
      ) {
        return res.status(400).json({
          message: 'Invalid shope_location format. Must be { type: "Point", coordinates: [lng, lat], address }',
        });
      }
      location = parsedLocation;
    } catch (error) {
      return res.status(400).json({ message: "Invalid shope_location JSON", error: error.message });
    }

    // Time check
    if (!isFullDay && (!fromTime || !toTime)) {
      return res.status(400).json({ message: "fromTime and toTime required when isFullDay is false" });
    }

    // Validate tag
    if (!tag || !Array.isArray(tag) || tag.length === 0) {
      return res.status(400).json({ message: "At least one tag is required" });
    }

    // Validate validTill
    if (new Date(validTill) <= new Date() || isNaN(new Date(validTill).getTime())) {
      return res.status(400).json({ message: "validTill must be a valid future date" });
    }

    let parsedCategoryIds = categoryIds;

    // If categoryIds is a string, parse it
    if (typeof categoryIds === "string") {
      try {
        parsedCategoryIds = JSON.parse(categoryIds);
      } catch (error) {
        return res.status(400).json({ message: "Invalid categoryIds format" });
      }
    }

    // Validate array
    if (!Array.isArray(parsedCategoryIds) || parsedCategoryIds.length === 0) {
      return res.status(400).json({ message: "categoryIds must be a non-empty array" });
    }

    // Check invalid IDs
    const invalidIds = parsedCategoryIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ message: `Invalid category IDs: ${invalidIds.join(", ")}` });
    }

    // Fetch categories
    const categories = await Category.find({ _id: { $in: parsedCategoryIds } });
    if (categories.length !== parsedCategoryIds.length) {
      return res.status(404).json({ message: "One or more categories not found" });
    }

    // Handle Images
    let copuon_image = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadPromises = req.files.map(file =>
          uploadToCloudinary(file.buffer, "coupons")
        );
        const uploadResults = await Promise.all(uploadPromises);
        copuon_image = uploadResults.map(result => result.secure_url);
      } catch (error) {
        return res.status(500).json({ message: "Error uploading images", error: error.message });
      }
    }

    // Save Coupon
    const newCoupon = new Coupon({
      title,
      shop_name,
      coupon_color,
      manul_address: manual_address,
      copuon_srno,
      category: categories.map(c => c._id), // ✅ multiple categories
      discountPercentage: parsedDiscount,
      createdBy,
      ownerId: ownerId || partnerId,
      createdby: userId,
      validTill: new Date(validTill),
      style,
      active: false,
      maxDistributions,
      fromTime: isFullDay ? undefined : fromTime,
      toTime: isFullDay ? undefined : toTime,
      isFullDay,
      termsAndConditions,
      is_spacial_copun,
      isTransferable,
      tag,
      shope_location: location,
      copuon_image,
      currentDistributions: 0,
      consumersId: [],
    });

    const savedCoupon = await newCoupon.save();

    // Broadcast notification to users within 50 km
    try {
      const users = await User.find(
        {
          latestLocation: {
            $near: {
              $geometry: { type: "Point", coordinates: location.coordinates },
              $maxDistance: 50 * 1000,
            },
          },
          devicetoken: { $ne: null },
        },
        { uid: 1, name: 1, devicetoken: 1, _id: 0 }
      );

      if (users.length > 0) {
        const batchSize = 500;
        const batches = [];
        for (let i = 0; i < users.length; i += batchSize) {
          const batchTokens = users.slice(i, i + batchSize).map(u => u.devicetoken);
          batches.push({
            notification: {
              title: `New Coupon: ${title}`,
              body: `Get ${parsedDiscount}% off near you! Valid until ${new Date(validTill).toLocaleDateString()}.`,
            },
            tokens: batchTokens,
          });
        }

        await Promise.all(batches.map(batch => admin.messaging().sendMulticast(batch)));
      }
    } catch (notificationError) {
      console.error("Error sending notifications:", notificationError);
    }

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon: savedCoupon,
    });

  } catch (err) {
    console.error("Create coupon error:", err);
    return res.status(500).json({ message: "Error creating coupon", error: err.message });
  }
};

export const updateCouponDeatils = async (req, res) => {
  try {
    const userId = req.user.id;
    const { couponId } = req.params;
    const { maxDistributions, coupon_color } = req.body;

    // ✅ Validate couponId
    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ message: "Invalid coupon ID" });
    }

    // ✅ Find the coupon
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    // ✅ Validate owner
    if (!coupon.ownerId.equals(new mongoose.Types.ObjectId(userId))) {
      return res
        .status(403)
        .json({ message: "You are not allowed to update this coupon" });
    }

    // ✅ Check if coupon is active & valid
    const now = new Date();
    if (!coupon.active) {
      return res.status(400).json({ message: "Coupon is not active" });
    }

    if (coupon.validTill < now) {
      return res.status(400).json({ message: "Coupon has expired" });
    }

    // ✅ Update only allowed fields
    if (maxDistributions !== undefined)
      coupon.maxDistributions = maxDistributions;

    if (coupon_color) coupon.coupon_color = coupon_color;

    await coupon.save();

    return res
      .status(200)
      .json({ message: "Coupon updated successfully", coupon });
  } catch (error) {
    console.error("❌ updateCouponDeatils Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getAvailableCouponsWithDetails = async (req, res) => {
  try {
    const { userId } = req.params; // Assuming you want coupons for a specific user

    // Get all available user coupons for this user with populated coupon details
    const availableCoupons = await UserCoupon.find({
      userId: userId,
      status: 'available'
    })
      .populate({
        path: 'couponId',
        model: 'Coupon',
        populate: [
          {
            path: 'createdby',
            model: 'User',
            select: 'name phone' // Select only necessary fields
          },
          {
            path: 'ownerId',
            model: 'User',
            select: 'name phone' // Select only necessary fields
          },
          {
            path: 'category',
            model: 'Category',
            select: 'name' // Select only necessary fields
          }
        ]
      })
      .populate({
        path: 'senders.senderId',
        model: 'User',
        select: 'name phone' // Select only necessary sender info
      })
      .sort({ createdAt: -1 }); // Sort by newest first

    // Format the response to include all necessary details
    const formattedCoupons = availableCoupons.map(userCoupon => {
      const coupon = userCoupon.couponId;

      return {
        userCouponId: userCoupon._id,
        status: userCoupon.status,
        count: userCoupon.count,
        qrCode: userCoupon.qrCode,
        createdAt: userCoupon.createdAt,
        updatedAt: userCoupon.updatedAt,

        // Coupon details
        coupon: {
          _id: coupon._id,
          title: coupon.title,
          copuon_image: coupon.copuon_image,
          manul_address: coupon.manul_address,
          copuon_srno: coupon.copuon_srno,
          category: coupon.category,
          copuon_type: coupon.copuon_type,
          discountPercentage: coupon.discountPercentage,
          validTill: coupon.validTill,
          style: coupon.style,
          fromTime: coupon.fromTime,
          toTime: coupon.toTime,
          isFullDay: coupon.isFullDay,
          termsAndConditions: coupon.termsAndConditions,
          is_spacial_copun: coupon.is_spacial_copun,
          isTransferable: coupon.isTransferable,
          tag: coupon.tag,
          shope_location: coupon.shope_location,
          createdby: coupon.createdby,
          ownerId: coupon.ownerId
        },

        // Sender details
        senders: userCoupon.senders.map(sender => ({
          senderId: sender.senderId,
          sentAt: sender.sentAt,
          senderName: sender.senderId?.name,
          senderEmail: sender.senderId?.email
        }))
      };
    });

    res.status(200).json({
      success: true,
      count: formattedCoupons.length,
      data: formattedCoupons
    });
  } catch (error) {
    console.error('Error fetching available coupons:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching coupons',
      error: error.message
    });
  }
};

export const getOwnerCoupons = async (req, res) => {
  try {
    const { ownerId } = req.params;

    // Validate ownerId
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid owner ID'
      });
    }

    // Find all coupons for the owner
    const coupons = await Coupon.find({ ownerId })
      .populate('createdby', 'name phone') // Populate creator details
      .populate('category', 'name') // Populate category details
      .select('-__v') // Exclude version key
      .lean(); // Convert to plain JavaScript object

    // Check if coupons exist
    if (!coupons || coupons.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No coupons found for this owner'
      });
    }

    // Return success response
    res.status(200).json({
      success: true,
      count: coupons.length,
      data: coupons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while fetching coupons',
      error: error.message
    });
  }
};



// @desc    Get detailed information for a specific coupon owned by an owner, with optional date filters
// @route   GET /api/coupons/:couponId/owner/:ownerId?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
// @access  Private

export const getOwnerCouponDetails = async (req, res) => {
  try {
    const { couponId, ownerId } = req.params;
    const { fromDate, toDate } = req.query;

    // Validate ownerId and couponId
    if (!mongoose.Types.ObjectId.isValid(ownerId) || !mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid owner ID or coupon ID',
      });
    }

    // Fetch the coupon details (unchanged, as filters don't apply here)
    const coupon = await Coupon.findOne({ _id: couponId, ownerId })
      .populate('createdby', 'name email')
      .populate('category', 'name')
      .select('-__v')
      .lean();

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found or does not belong to this owner',
      });
    }

    // Build query for user coupons with date filters on createdAt
    let userCouponQuery = { couponId };
    const userCouponDateFilter = {};
    if (fromDate) {
      try {
        userCouponDateFilter.$gte = new Date(fromDate);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid fromDate format. Use YYYY-MM-DD.',
        });
      }
    }
    if (toDate) {
      try {
        userCouponDateFilter.$lte = new Date(toDate);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid toDate format. Use YYYY-MM-DD.',
        });
      }
    }
    if (Object.keys(userCouponDateFilter).length > 0) {
      userCouponQuery.createdAt = userCouponDateFilter;
    }

    // Fetch associated user coupons with filters
    const userCoupons = await UserCoupon.find(userCouponQuery)
      .populate('userId', 'name email')
      .populate('senders.senderId', 'name email')
      .select('-__v')
      .sort({ createdAt: -1 }) // Sort by createdAt descending for more recent first
      .lean();

    // Build query for sales with date filters on createdAt
    let salesQuery = { couponId };
    const salesDateFilter = {};
    if (fromDate) {
      salesDateFilter.$gte = new Date(fromDate);
    }
    if (toDate) {
      salesDateFilter.$lte = new Date(toDate);
    }
    if (Object.keys(salesDateFilter).length > 0) {
      salesQuery.createdAt = salesDateFilter;
    }

    // Fetch associated sales with filters
    const sales = await Salses.find(salesQuery)
      .populate('userId', 'name email')
      .select('-__v')
      .sort({ createdAt: -1 }) // Sort by createdAt descending for more recent first
      .lean();

    // Calculate aggregate statistics (now based on filtered data)
    const stats = {
      totalUserCoupons: userCoupons.length,
      availableCoupons: userCoupons.filter(uc => uc.status === 'available').length,
      usedCoupons: userCoupons.filter(uc => uc.status === 'used').length,
      transferredCoupons: userCoupons.filter(uc => uc.status === 'transferred').length,
      cancelledCoupons: userCoupons.filter(uc => uc.status === 'cancelled').length,
      totalSales: sales.length,
      completedSales: sales.filter(s => s.status === 'completed').length,
      ongoingSales: sales.filter(s => s.status === 'ongoing').length,
      cancelledSales: sales.filter(s => s.status === 'cancelled').length,
      totalRevenue: sales.reduce((sum, sale) => sum + (sale.finalAmount || 0), 0),
      totalDiscount: sales.reduce((sum, sale) => sum + (sale.discountAmount || 0), 0),
      // Additional in-depth stats
      averageDiscount: sales.length > 0 ? (sales.reduce((sum, sale) => sum + (sale.discountAmount || 0), 0) / sales.length) : 0,
      totalUsedCount: sales.reduce((sum, sale) => sum + (sale.usedCount || 0), 0),
      averageFinalAmount: sales.length > 0 ? (sales.reduce((sum, sale) => sum + (sale.finalAmount || 0), 0) / sales.length) : 0,
      earliestEntry: Math.min(
        ...userCoupons.map(uc => uc.createdAt?.getTime() || Infinity),
        ...sales.map(s => s.createdAt?.getTime() || Infinity)
      ) === Infinity ? null : new Date(Math.min(
        ...userCoupons.map(uc => uc.createdAt?.getTime() || Infinity),
        ...sales.map(s => s.createdAt?.getTime() || Infinity)
      )),
      latestEntry: Math.max(
        ...userCoupons.map(uc => uc.createdAt?.getTime() || -Infinity),
        ...sales.map(s => s.createdAt?.getTime() || -Infinity)
      ) === -Infinity ? null : new Date(Math.max(
        ...userCoupons.map(uc => uc.createdAt?.getTime() || -Infinity),
        ...sales.map(s => s.createdAt?.getTime() || -Infinity)
      )),
    };

    // Return the response with applied filters noted
    res.status(200).json({
      success: true,
      filtersApplied: {
        fromDate: fromDate || 'None',
        toDate: toDate || 'None',
      },
      data: {
        couponDetails: coupon,
        userCoupons,
        sales,
        stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error while fetching coupon details',
      error: error.message,
    });
  }
};



/* 1. Get My Coupons */

export const getMyCoupons = async (req, res) => {
  try {
    const userId = req.user._id;
    const userType = req.user.type;
    const {
      page = 1,
      limit = 10,
      search,
      tag,
      category,
      exportCSV
    } = req.query;

    let filter = {};
    if (userType === "partner") {
      filter.ownerId = userId;
    } else if (["agency", "super_admin"].includes(userType)) {
      filter.createdby = userId;
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { tags: { $in: [search] } }
      ];
    }

    if (tag) filter.tags = { $in: [tag] };
    if (category && mongoose.Types.ObjectId.isValid(category)) filter.category = category;

    const skip = (page - 1) * limit;

    let query = Coupon.find(filter).populate("category", "name");
    const total = await Coupon.countDocuments(filter);

    if (!exportCSV) {
      let coupons = await query.skip(skip).limit(Number(limit)).lean();
      // Add used count for each coupon (assuming UserCoupon model exists)
      for (const coupon of coupons) {
        coupon.used = await UserCoupon.countDocuments({ couponId: coupon._id, status: "used" });
      }
      return res.status(200).json({
        success: true,
        page: Number(page),
        limit: Number(limit),
        total,
        data: coupons,
      });
    }

    let allCoupons = await query.lean();
    // Add used count for export if needed, but skipping for now
    const exportData = allCoupons.map(c => ({
      Title: c.title,
      Discount: c.discount,
      Category: c.category?.name,
      CreatedAt: c.createdAt,
    }));
    return exportToCSV(res, exportData, "my_coupons.csv");
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


/* 2. Get All Coupons (SuperAdmin) */
export const getAllCouponsForAdmin = async (req, res) => {
  try {
    if (req.user.type !== "super_admin") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied" });
    }

    const {
      page = 1,
      limit = 10,
      search,
      tag,
      category,
      exportCSV,
      status, // "active" | "inactive"
      fromDate,
      toDate,
    } = req.query;

    let filter = {};

    // 🔍 Search filter
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ title: regex }, { tag: { $in: [regex] } }];
    }

    // 🎯 Tag filter
    if (tag) filter.tag = { $in: [tag] };

    // 📂 Category filter
    if (category && mongoose.Types.ObjectId.isValid(category))
      filter.category = category;

    // ⚙️ Active / Inactive filter
    if (status === "active") filter.active = true;
    else if (status === "inactive") filter.active = false;

    // 📅 Date range filter (by creationDate)
    if (fromDate || toDate) {
      filter.creationDate = {};
      if (fromDate) filter.creationDate.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.creationDate.$lte = end;
      }
    }

    const skip = (page - 1) * limit;

    let query = Coupon.find(filter)
      .populate("category", "name")
      .populate("createdby", "name phone type")
      .populate("ownerId", "name phone type");

    const total = await Coupon.countDocuments(filter);

    // 📊 Summary counts (Active, Inactive, Expiring Soon)
    const now = new Date();
    const expiringSoonDate = new Date();
    expiringSoonDate.setDate(now.getDate() + 7); // within next 7 days

    const [activeCount, inactiveCount, expiringSoonCount] = await Promise.all([
      Coupon.countDocuments({ active: true }),
      Coupon.countDocuments({ active: false }),
      Coupon.countDocuments({
        active: true,
        validTill: { $gte: now, $lte: expiringSoonDate },
      }),
    ]);

    // 📤 If exportCSV is not requested
    if (!exportCSV) {
      let coupons = await query.skip(skip).limit(Number(limit)).lean();

      // Add "used" count for each coupon
      for (const coupon of coupons) {
        coupon.used = await UserCoupon.countDocuments({
          couponId: coupon._id,
          status: "used",
        });
      }

      return res.status(200).json({
        success: true,
        page: Number(page),
        limit: Number(limit),
        total,
        summary: {
          active: activeCount,
          inactive: inactiveCount,
          expiringSoon: expiringSoonCount,
        },
        data: coupons,
      });
    }

    // 📦 CSV Export
    let allCoupons = await query.lean();
    const exportData = allCoupons.map((c) => ({
      Title: c.title,
      Discount: c.discountPercentage,
      Category: c.category?.name,
      CreatedBy: c.createdby?.name,
      OwnerBy: c.ownerId?.name,
      CreatedAt: c.creationDate,
      ValidTill: c.validTill,
      Status: c.active ? "Active" : "Inactive",
    }));

    return exportToCSV(res, exportData, "all_coupons.csv");
  } catch (error) {
    console.error("Error in getAllCouponsForAdmin:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getById = async (req, res) => {
  try {
    const { id } = req.params; // 👈 FIXED here

    // Fetch coupon with details, only phone + name for users
    const coupon = await Coupon.findById(id)
      .populate("createdby", "name phone")
      .populate("category", "name")
      .populate("ownerId", "name phone")

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Coupon fetched successfully",
      data: coupon,
    });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching coupon",
      error: error.message,
    });
  }
};




const toggleActive = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    coupon.active = !coupon.active;
    await coupon.save();
    res.status(200).json({ message: 'Coupon status toggled successfully', coupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error toggling coupon status',
      error: error.message
    });
  }
}




// export const getAllCouponsWithStatusTag = async (req, res) => {
//   try {
//     // Determine user ID (null for guests)
//     let userId = null;
//     if (req.user?.id && mongoose.isValidObjectId(req.user.id)) {
//       userId = new mongoose.Types.ObjectId(req.user.id);
//     }

//     // Validate query parameters
//     const { radius = 100000, search = '', page = 1, limit = 50, manualCode, lat, lng, category } = req.query;
//     const parsedPage = parseInt(page);
//     const parsedLimit = parseInt(limit);
//     const parsedRadius = parseInt(radius);

//     if (isNaN(parsedPage) || parsedPage < 1) {
//       return res.status(400).json({ success: false, message: 'Invalid page number' });
//     }
//     if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
//       return res.status(400).json({ success: false, message: 'Invalid limit, must be between 1 and 100' });
//     }
//     if ((lat && isNaN(Number(lat))) || (lng && isNaN(Number(lng)))) {
//       return res.status(400).json({ success: false, message: 'Invalid latitude or longitude' });
//     }
//     if (isNaN(parsedRadius) || parsedRadius < 0) {
//       return res.status(400).json({ success: false, message: 'Invalid radius' });
//     }

//     // Enhanced category validation (supports single or multiple IDs)
//     let categoryFilter = null;
//     if (category) {
//       const categoryIds = Array.isArray(category) ? category : category.split(',');
//       const validIds = categoryIds.filter(id => mongoose.isValidObjectId(id));
//       if (validIds.length !== categoryIds.length) {
//         return res.status(400).json({ success: false, message: 'One or more invalid category IDs' });
//       }
//       const foundCategories = await Category.find({ _id: { $in: validIds } }).select('_id');
//       if (foundCategories.length !== validIds.length) {
//         return res.status(400).json({ success: false, message: 'One or more categories not found' });
//       }
//       categoryFilter = { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) };
//     }

//     const skip = (parsedPage - 1) * parsedLimit;

//     let mode = userId ? 'user' : 'guest';
//     let baseLocation = null;
//     let effectiveRadius = parsedRadius;
//     let sortByLatest = false;

//     // 1️⃣ Logged-in user: Get latestLocation
//     if (userId) {
//       const user = await User.findById(userId).select('latestLocation');
//       if (user?.latestLocation?.coordinates && user.latestLocation.coordinates[0] !== 0 && user.latestLocation.coordinates[1] !== 0) {
//         const [userLng, userLat] = user.latestLocation.coordinates;
//         baseLocation = { type: 'Point', coordinates: [userLng, userLat] };
//       }
//     }

//     // 2️⃣ Manual location (via manualCode)
//     let manualLocation = null;
//     if (manualCode) {
//       manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode }).select('city state location');
//       if (manualLocation?.location?.coordinates) {
//         if (!baseLocation) {
//           baseLocation = manualLocation.location;
//           mode = 'manual';
//           effectiveRadius = parsedRadius; // ✅ FIX: Use the parsed radius instead of null
//         } else {
//           const check = await ManualAddress.aggregate([
//             {
//               $geoNear: {
//                 near: baseLocation,
//                 distanceField: 'distance',
//                 spherical: true,
//                 query: { uniqueCode: manualCode },
//               },
//             },
//             { $project: { distance: 1 } },
//           ]);

//           const distance = check[0]?.distance || 0;
//           if (distance > 100000) {
//             mode = 'manual';
//             baseLocation = manualLocation.location;
//             effectiveRadius = parsedRadius; // ✅ FIX: Use the parsed radius instead of null
//           }
//         }
//       }
//     }

//     // 3️⃣ Custom location from query params (lat, lng)
//     if (lat && lng) {
//       baseLocation = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
//       mode = 'custom';
//       effectiveRadius = parsedRadius || 100000;
//     }

//     // 4️⃣ Fallback: Default location (center of India) with no radius for latest coupons
//     if (!baseLocation) {
//       baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] };
//       mode = 'default';
//       effectiveRadius = null;
//       sortByLatest = true;
//     }

//     // 5️⃣ Build search regex
//     const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

//     // 6️⃣ Build match query for geoNear
//     const geoQuery = {
//       ...(categoryFilter ? { category: categoryFilter } : {}),
//     };

//     // 7️⃣ Build aggregation pipeline
//     const dataPipeline = [
//       {
//         $geoNear: {
//           near: baseLocation,
//           distanceField: 'distance',
//           ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
//           spherical: true,
//           key: 'shope_location',
//           query: geoQuery,
//         },
//       },
//       ...(search.trim()
//         ? [
//           {
//             $match: {
//               $or: [
//                 { manual_address: searchRegex },
//                 { title: searchRegex },
//                 { tag: { $elemMatch: { $regex: searchRegex } } },
//               ],
//             },
//           },
//         ]
//         : []),
//       ...(userId
//         ? [
//           {
//             $lookup: {
//               from: 'usercoupons',
//               let: { couponId: '$_id' },
//               pipeline: [
//                 {
//                   $match: {
//                     $expr: {
//                       $and: [
//                         { $eq: ['$couponId', '$$couponId'] },
//                         { $eq: ['$userId', userId] },
//                       ],
//                     },
//                   },
//                 },
//                 { $project: { status: 1, _id: 0 } },
//               ],
//               as: 'userStatus',
//             },
//           },
//           { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
//           // Only include active coupons that are not used or transferred
//           {
//             $match: {
//               active: true,
//               $or: [
//                 { validTill: { $gt: new Date() } },
//                 { validTill: null },
//               ],
//               $or: [
//                 { userStatus: { $exists: false } }, // Coupons not claimed by the user
//                 { 'userStatus.status': { $nin: ['used', 'transferred'] } }, // Exclude used or transferred
//               ],
//             },
//           },
//           {
//             $addFields: {
//               displayTag: {
//                 $switch: {
//                   branches: [
//                     { case: { $eq: ['$userStatus.status', 'available'] }, then: 'Available' },
//                     { case: { $eq: ['$userStatus.status', 'cancelled'] }, then: 'Cancelled' },
//                   ],
//                   default: 'Available',
//                 },
//               },
//             },
//           },
//         ]
//         : [
//           {
//             $match: {
//               active: true,
//               $or: [
//                 { validTill: { $gt: new Date() } },
//                 { validTill: null },
//               ],
//             },
//           },
//           {
//             $addFields: {
//               displayTag: { $ifNull: [{ $arrayElemAt: ['$tag', 0] }, 'Available'] },
//             },
//           },
//         ]),
//       {
//         $project: {
//           title: 1,
//           shop_name: 1,
//           copuon_image: 1,
//           manual_address: 1,
//           copuon_srno: 1,
//           coupon_color: 1,
//           discountPercentage: 1,
//           validTill: 1,
//           displayTag: 1,
//           distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
//         },
//       },
//       { $sort: sortByLatest ? { validTill: -1, createdAt: -1 } : { distance: 1, validTill: -1 } },
//       { $skip: skip },
//       { $limit: parsedLimit },
//     ];

//     const coupons = await Coupon.aggregate(dataPipeline);

//     // 8️⃣ Count pipeline
//     const countPipeline = [
//       {
//         $geoNear: {
//           near: baseLocation,
//           distanceField: 'distance',
//           ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
//           spherical: true,
//           key: 'shope_location',
//           query: geoQuery,
//         },
//       },
//       ...(search.trim()
//         ? [
//           {
//             $match: {
//               $or: [
//                 { manual_address: searchRegex },
//                 { title: searchRegex },
//                 { tag: { $elemMatch: { $regex: searchRegex } } },
//               ],
//             },
//           },
//         ]
//         : []),
//       ...(userId
//         ? [
//           {
//             $lookup: {
//               from: 'usercoupons',
//               let: { couponId: '$_id' },
//               pipeline: [
//                 {
//                   $match: {
//                     $expr: {
//                       $and: [
//                         { $eq: ['$couponId', '$$couponId'] },
//                         { $eq: ['$userId', userId] },
//                       ],
//                     },
//                   },
//                 },
//                 { $project: { status: 1, _id: 0 } },
//               ],
//               as: 'userStatus',
//             },
//           },
//           { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
//           {
//             $match: {
//               active: true,
//               $or: [
//                 { validTill: { $gt: new Date() } },
//                 { validTill: null },
//               ],
//               $or: [
//                 { userStatus: { $exists: false } }, // Coupons not claimed by the user
//                 { 'userStatus.status': { $nin: ['used', 'transferred'] } }, // Exclude used or transferred
//               ],
//             },
//           },
//         ]
//         : [
//           {
//             $match: {
//               active: true,
//               $or: [
//                 { validTill: { $gt: new Date() } },
//                 { validTill: null },
//               ],
//             },
//           },
//         ]),
//       { $count: 'total' },
//     ];

//     const totalResult = await Coupon.aggregate(countPipeline);
//     const total = totalResult[0]?.total || 0;

//     res.status(200).json({
//       success: true,
//       mode,
//       data: coupons,
//       page: parsedPage,
//       limit: parsedLimit,
//       total,
//       pages: Math.ceil(total / parsedLimit),
//     });
//   } catch (error) {
//     console.error('Error fetching coupons:', error);
//     res.status(500).json({ success: false, message: 'An unexpected error occurred' });
//   }
// };

export const getAllCouponsWithStatusTag = async (req, res) => {
  try {
    // Determine user ID (null for guests)
    let userId = null;
    if (req.user?.id && mongoose.isValidObjectId(req.user.id)) {
      userId = new mongoose.Types.ObjectId(req.user.id);
    }

    // Validate query parameters
    const { radius = 100000, search = '', page = 1, limit = 50, manualCode, lat, lng, category } = req.query;
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const parsedRadius = parseInt(radius);

    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ success: false, message: 'Invalid page number' });
    }
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ success: false, message: 'Invalid limit, must be between 1 and 100' });
    }
    if ((lat && isNaN(Number(lat))) || (lng && isNaN(Number(lng)))) {
      return res.status(400).json({ success: false, message: 'Invalid latitude or longitude' });
    }
    if (isNaN(parsedRadius) || parsedRadius < 0) {
      return res.status(400).json({ success: false, message: 'Invalid radius' });
    }

    // Enhanced category validation (supports single or multiple IDs)
    let categoryFilter = null;
    if (category) {
      const categoryIds = Array.isArray(category) ? category : category.split(',');
      const validIds = categoryIds.filter(id => mongoose.isValidObjectId(id));
      if (validIds.length !== categoryIds.length) {
        return res.status(400).json({ success: false, message: 'One or more invalid category IDs' });
      }
      const foundCategories = await Category.find({ _id: { $in: validIds } }).select('_id');
      if (foundCategories.length !== validIds.length) {
        return res.status(400).json({ success: false, message: 'One or more categories not found' });
      }
      categoryFilter = { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) };
    }

    const skip = (parsedPage - 1) * parsedLimit;

    let mode = userId ? 'user' : 'guest';
    let baseLocation = null;
    let effectiveRadius = parsedRadius;
    let sortByLatest = false;

    // 1️⃣ Logged-in user: Get latestLocation
    if (userId) {
      const user = await User.findById(userId).select('latestLocation');
      if (user?.latestLocation?.coordinates && user.latestLocation.coordinates[0] !== 0 && user.latestLocation.coordinates[1] !== 0) {
        const [userLng, userLat] = user.latestLocation.coordinates;
        baseLocation = { type: 'Point', coordinates: [userLng, userLat] };
      }
    }

    // 2️⃣ Manual location (via manualCode)
    let manualLocation = null;
    if (manualCode) {
      manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode }).select('city state location');
      if (manualLocation?.location?.coordinates) {
        if (!baseLocation) {
          baseLocation = manualLocation.location;
          mode = 'manual';
          effectiveRadius = parsedRadius;
        } else {
          const check = await ManualAddress.aggregate([
            {
              $geoNear: {
                near: baseLocation,
                distanceField: 'distance',
                spherical: true,
                query: { uniqueCode: manualCode },
              },
            },
            { $project: { distance: 1 } },
          ]);

          const distance = check[0]?.distance || 0;
          if (distance > 100000) {
            mode = 'manual';
            baseLocation = manualLocation.location;
            effectiveRadius = parsedRadius;
          }
        }
      }
    }

    // 3️⃣ Custom location from query params (lat, lng)
    if (lat && lng) {
      baseLocation = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
      mode = 'custom';
      effectiveRadius = parsedRadius || 100000;
    }

    // 4️⃣ Fallback: Default location (center of India) with no radius for latest coupons
    if (!baseLocation) {
      baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] };
      mode = 'default';
      effectiveRadius = null;
      sortByLatest = true;
    }

    // 5️⃣ Build search regex
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    // 6️⃣ Build match query for geoNear
    const geoQuery = {
      ...(categoryFilter ? { category: categoryFilter } : {}),
    };

    // 7️⃣ Build aggregation pipeline
    const dataPipeline = [
      {
        $geoNear: {
          near: baseLocation,
          distanceField: 'distance',
          ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
          spherical: true,
          key: 'shope_location',
          query: geoQuery,
        },
      },
      ...(search.trim()
        ? [
          {
            $match: {
              $or: [
                { manual_address: searchRegex },
                { title: searchRegex },
                { tag: { $elemMatch: { $regex: searchRegex } } },
              ],
            },
          },
        ]
        : []),
      ...(userId
        ? [
          {
            $lookup: {
              from: 'usercoupons',
              let: { couponId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$couponId', '$$couponId'] },
                        { $eq: ['$userId', userId] },
                      ],
                    },
                  },
                },
                { $project: { status: 1, count: 1, _id: 0 } },
              ],
              as: 'userStatus',
            },
          },
          { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
          // Only include active coupons that are not used or transferred and have count > 0
          {
            $match: {
              active: true,
              $or: [
                { validTill: { $gt: new Date() } },
                { validTill: null },
              ],
              $or: [
                { userStatus: { $exists: false } }, // Coupons not claimed by the user
                {
                  $and: [
                    { 'userStatus.status': { $nin: ['used', 'transferred'] } },
                    { 'userStatus.count': { $gte: 1 } },
                  ],
                },
              ],
            },
          },
          // Add fields for couponCount and formatted displayTag (e.g., "Available coupon: 1")
          {
            $addFields: {
              couponCount: { $ifNull: ['$userStatus.count', 1] },
            },
          },
          {
            $addFields: {
              displayTag: {
                $cond: {
                  if: { $eq: ['$userStatus.status', 'cancelled'] },
                  then: { $concat: ['Cancelled: ', { $toString: '$couponCount' }] },
                  else: { $concat: ['Available: ', { $toString: '$couponCount' }] },
                },
              },
            },
          },
        ]
        : [
          {
            $match: {
              active: true,
              $or: [
                { validTill: { $gt: new Date() } },
                { validTill: null },
              ],
            },
          },
          {
            $addFields: {
              displayTag: 'Available coupon: 1',
            },
          },
        ]),
      {
        $project: {
          title: 1,
          shop_name: 1,
          copuon_image: 1,
          manual_address: 1,
          copuon_srno: 1,
          coupon_color: 1,
          is_spacial_copun: 1,
          isTransferable: 1,
          discountPercentage: 1,
          validTill: 1,
          displayTag: 1,
          distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
        },
      },
      { $sort: sortByLatest ? { validTill: -1, createdAt: -1 } : { distance: 1, validTill: -1 } },
      { $skip: skip },
      { $limit: parsedLimit },
    ];

    const coupons = await Coupon.aggregate(dataPipeline);

    // 8️⃣ Count pipeline (now counts unique coupons, not summed instances)
    const countPipeline = [
      {
        $geoNear: {
          near: baseLocation,
          distanceField: 'distance',
          ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
          spherical: true,
          key: 'shope_location',
          query: geoQuery,
        },
      },
      ...(search.trim()
        ? [
          {
            $match: {
              $or: [
                { manual_address: searchRegex },
                { title: searchRegex },
                { tag: { $elemMatch: { $regex: searchRegex } } },
              ],
            },
          },
        ]
        : []),
      ...(userId
        ? [
          {
            $lookup: {
              from: 'usercoupons',
              let: { couponId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$couponId', '$$couponId'] },
                        { $eq: ['$userId', userId] },
                      ],
                    },
                  },
                },
                { $project: { status: 1, count: 1, _id: 0 } },
              ],
              as: 'userStatus',
            },
          },
          { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
          {
            $match: {
              active: true,
              $or: [
                { validTill: { $gt: new Date() } },
                { validTill: null },
              ],
              $or: [
                { userStatus: { $exists: false } },
                {
                  $and: [
                    { 'userStatus.status': { $nin: ['used', 'transferred'] } },
                    { 'userStatus.count': { $gte: 1 } },
                  ],
                },
              ],
            },
          },
          { $count: 'total' },
        ]
        : [
          {
            $match: {
              active: true,
              $or: [
                { validTill: { $gt: new Date() } },
                { validTill: null },
              ],
            },
          },
          { $count: 'total' },
        ]),
    ];

    const totalResult = await Coupon.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    res.status(200).json({
      success: true,
      mode,
      data: coupons,
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred' });
  }
};


export const transferCoupon = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const senderId = req.user._id;
    const { receiverId, couponId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(receiverId) || !mongoose.Types.ObjectId.isValid(couponId)) {
      throw new Error("Invalid receiver or coupon ID");
    }

    if (senderId.toString() === receiverId) {
      throw new Error("Cannot transfer coupon to yourself");
    }

    // Fetch sequentially with session
    const sender = await User.findById(senderId).session(session);
    const receiver = await User.findById(receiverId).session(session);
    const coupon = await Coupon.findById(couponId).session(session);

    if (!sender || !receiver || !coupon) {
      throw new Error("Sender, receiver, or coupon not found");
    }

    if (!coupon.active || (coupon.validTill && new Date(coupon.validTill) < new Date())) {
      throw new Error("Coupon is inactive or expired");
    }

    if (coupon.is_spacial_copun || !coupon.isTransferable) {
      throw new Error("spacial coupon is not Transferable");
    }

    if (coupon.maxDistributions > 0 && coupon.currentDistributions >= coupon.maxDistributions) {
      throw new Error("Max distributions reached");
    }

    if (sender.couponCount < 1) {
      throw new Error("Sender has insufficient coupon count");
    }

    // Check receiver coupon usage
    const usedCount = await Salses.countDocuments({
      couponId,
      userId: receiverId,
      status: 'completed'
    }).session(session);

    if (usedCount >= 2) {
      throw new Error("Receiver already used coupon twice");
    }

    const receiverAvailableCoupon = await UserCoupon.findOne({
      userId: receiverId,
      couponId,
      status: 'available'
    }).session(session);

    if (receiverAvailableCoupon) {
      throw new Error("Receiver already has this coupon");
    }

    let senderCoupon = await UserCoupon.findOne({ userId: senderId, couponId }).session(session);
    let receiverUsedCoupon = await UserCoupon.findOne({ userId: receiverId, couponId }).session(session);

    const qrCode = `qr-${couponId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!senderCoupon) {
      senderCoupon = new UserCoupon({
        couponId,
        userId: senderId,
        status: 'transferred',
        transferredTo: receiverId,
        transferDate: new Date(),
        count: 0,
        qrCode: qrCode + '-sender'
      });
      await senderCoupon.save({ session });
    } else if (senderCoupon.status === 'available') {
      senderCoupon.count -= 1;
      senderCoupon.userId = receiverId;
      senderCoupon.transferDate = new Date();
      await senderCoupon.save({ session });
    }

    if (receiverUsedCoupon && receiverUsedCoupon.status === 'used') {
      receiverUsedCoupon.status = 'available';
      receiverUsedCoupon.senders.push({ senderId, sentAt: new Date() });
      receiverUsedCoupon.count += 1;
      receiverUsedCoupon.qrCode = qrCode;
      await receiverUsedCoupon.save({ session });
    } else {
      const newUserCoupon = new UserCoupon({
        couponId,
        userId: receiverId,
        status: 'available',
        senders: [{ senderId, sentAt: new Date() }],
        count: 1,
        qrCode
      });
      await newUserCoupon.save({ session });
    }

    sender.couponCount -= 1;
    receiver.couponCount += 1;
    await sender.save({ session });
    await receiver.save({ session });

    coupon.currentDistributions += 1;
    await coupon.save({ session });

    await session.commitTransaction();
    return res.status(200).json({ success: true, message: "Coupon transferred" });

  } catch (error) {
    await session.abortTransaction();
    return res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};


// export const claimCoupon = async (req, res) => {
//   try {
//     const userId = req.user._id;

//     const { couponId, useCount = 1, owner } = req.body;

//     if (!mongoose.Types.ObjectId.isValid(couponId)) {
//       return res.status(400).json({ success: false, message: "Invalid Coupon ID" });
//     }
//     // if (!mongoose.Types.ObjectId.isValid(ownerId)) {
//     //   return res.status(400).json({ success: false, message: "Invalid owner ID" });
//     // }
//     if (!owner) {
//       return res.status(400).json({ success: false, message: "Invalid Coupon ID" });
//     }
//     const decoded = jwt.verify(owner, JWT_SECRET)

//     if (!decoded || !decoded.userId) {
//       return res.status(401).json({ message: 'Invalid or expired token' });
//     }

//     // 3) Fetch user from DB
//     const user = await User.findById(decoded.userId).select('-password -otp -__v');
//     if (!user) {
//       return res.status(401).json({ message: 'User not found, authorization denied' });
//     }





//     const coupon = await Coupon.findOne({ _id: couponId, ownerId: user._id });

//     if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

//     if (new Date() > coupon.validTill) return res.statu(400).json({ success: false, message: "Coupon expired" });

//     if (coupon.maxDistributions > 0 && coupon.currentDistributions >= coupon.maxDistributions) {
//       return res.status(400).json({
//         success: false,
//         message: "Coupon limit reached"
//       });
//     }
//     let existingClaim = await UserCoupon.findOne({ couponId, userId });

//     if (existingClaim) {
//       if (existingClaim.status === "used") return res.status(400).json({ success: false, message: "Coupon already used" });
//       if (["cancelled", "transferred"].includes(existingClaim.status)) return res.status(400).json({ success: false, message: `Coupon already ${existingClaim.status}` });

//       if (existingClaim.status === "available") {
//         let totalCount = existingClaim.count - useCount;
//         if (totalCount < 0) totalCount = 0;

//         existingClaim.count = totalCount;
//         if (existingClaim.count === 0) {
//           existingClaim.status = "used";
//           existingClaim.useDate = new Date();
//         }

//         await existingClaim.save();

//         // Create ongoing sale (amount will be charged later)
//         const sale = new Salses({
//           couponId,
//           userId,


//           status: "ongoing",
//           usedCount: useCount
//         });
//         await sale.save();

//         return res.status(200).json({ success: true, message: "Coupon count reduced and sale record created (pending payment)", data: { userCoupon: existingClaim, sale } });
//       }
//     }

//     // New claim
//     const initialCount = useCount > 2 ? 2 : useCount;
//     const userCoupon = new UserCoupon({
//       couponId,
//       userId,
//       qrCode: `COUPON-${couponId}-${userId}-${Date.now()}`,
//       status: "available",
//       count: initialCount
//     });
//     await userCoupon.save();

//     const sale = new Salses({
//       couponId,
//       userId,
//       status: "ongoing",
//       usedCount: initialCount
//     });
//     await sale.save();


//     // 6️⃣ Update coupon distributions & consumers
//     coupon.currentDistributions += 1;
//     coupon.consumersId.push(userId);
//     await coupon.save();

//     return res.status(201).json({ success: true, message: "Coupon claimed and sale record created (pending payment)", data: { userCoupon, sale } });

//   } catch (error) {
//     console.error("Error claiming coupon:", error);
//     return res.status(500).json({ success: false, message: "Error claiming coupon", error: error.message });
//   }
// };




export const claimCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const { couponId, useCount = 1, owner } = req.body;

    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ success: false, message: "Invalid Coupon ID" });
    }

    if (!owner) {
      return res.status(400).json({ success: false, message: "Invalid Owner Token" });
    }

    // ✅ Verify owner token
    const decoded = jwt.verify(owner, JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ message: "Invalid or expired owner token" });
    }

    const ownerUser = await User.findById(decoded.userId);
    if (!ownerUser) {
      return res.status(401).json({ message: "Owner not found, authorization denied" });
    }

    // ✅ Check coupon
    const coupon = await Coupon.findOne({ _id: couponId, ownerId: ownerUser._id });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    if (!coupon.active) return res.status(400).json({ success: false, message: "Coupon is not active" });

    if (new Date() > coupon.validTill) return res.status(400).json({ success: false, message: "Coupon expired" });

    if (coupon.maxDistributions > 0 && coupon.currentDistributions >= coupon.maxDistributions) {
      return res.status(400).json({ success: false, message: "Coupon limit reached" });
    }

    // ✅ Check if user already has this coupon
    let userCoupon = await UserCoupon.findOne({ couponId, userId });

    if (userCoupon) {
      if (userCoupon.status === "used") {
        return res.status(400).json({ success: false, message: "Coupon already fully used" });
      }
      if (["cancelled", "transferred"].includes(userCoupon.status)) {
        return res.status(400).json({ success: false, message: `Coupon already ${userCoupon.status}` });
      }

      // If available → reduce count
      if (userCoupon.status === "available") {
        let remaining = userCoupon.count - useCount;
        if (remaining < 0) remaining = 0;

        userCoupon.count = remaining;
        if (remaining === 0) {
          userCoupon.status = "used";
          userCoupon.useDate = new Date();
        }
        await userCoupon.save();

        // ✅ Always create Sale (ongoing)
        const sale = new Salses({
          couponId,
          userId,
          status: "ongoing",
          usedCount: useCount
        });
        await sale.save();

        return res.status(200).json({
          success: true,
          message: "Coupon usage updated",
          data: { userCoupon, sale }
        });
      }
    }

    // ✅ If user has no coupon → directly mark as used (count=0)
    userCoupon = new UserCoupon({
      couponId,
      userId,
      status: "used",
      count: 0,
      useDate: new Date()
    });
    await userCoupon.save();

    // ✅ Sale always ongoing
    const sale = new Salses({
      couponId,
      userId,
      status: "ongoing",
      usedCount: 0
    });
    await sale.save();

    return res.status(201).json({
      success: true,
      message: "Coupon created as used (no prior claim found)",
      data: { userCoupon, sale }
    });

  } catch (error) {
    console.error("Error claiming coupon:", error);
    return res.status(500).json({ success: false, message: "Error claiming coupon", error: error.message });
  }
};

export const getSales = async (req, res) => {
  try {
    const userId = req.user.id;

    // Pagination: get page and limit from query, default page=1, limit=10
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find sales for the user with pagination and populate coupon details with owner info
    const sales = await Salses.find({ userId })
      .populate({
        path: 'couponId',
        select: 'title discountPercentage validTill category copuon_type termsAndConditions tag isTransferable ownerId',
        populate: [
          {
            path: 'category',
            select: 'name'
          },
          {
            path: 'ownerId',
            select: 'name phone' // Owner details: name and phone
          }
        ]
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Get total count for pagination info
    const totalSales = await Salses.countDocuments({ userId });

    res.status(200).json({
      success: true,
      page,
      limit,
      totalPages: Math.ceil(totalSales / limit),
      totalSales,
      sales
    });

  } catch (error) {
    console.error("Error fetching sales:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales",
      error: error.message
    });
  }
};

export const getOngoingServices = async (req, res) => {
  try {
    const userId = req.user.id;

    // Pagination support
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sales = await Salses.find({ userId, status: "ongoing" })
      .populate({
        path: "couponId",
        select: "title discountPercentage copuon_image validTill category copuon_type termsAndConditions tag isTransferable ownerId",
        populate: [
          { path: "category", select: "name" },
          { path: "ownerId", select: "name phone" },
        ],
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const totalSales = await Salses.countDocuments({
      userId,
      status: "ongoing",
    });

    res.status(200).json({
      success: true,
      page,
      limit,
      totalPages: Math.ceil(totalSales / limit),
      totalSales,
      sales,
    });
  } catch (error) {
    console.error("Error fetching ongoing services:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ongoing services",
      error: error.message,
    });
  }
};

export const getSalesByCouponOwner = async (req, res) => {
  try {
    const userId = req.user.id; // logged-in user
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Aggregation pipeline
    const pipeline = [
      // 1️⃣ Join with Coupon collection
      {
        $lookup: {
          from: "coupons",
          localField: "couponId",
          foreignField: "_id",
          as: "coupon"
        }
      },
      { $unwind: "$coupon" },
      // 2️⃣ Only sales where the coupon's owner is the logged-in user
      {
        $match: {
          "coupon.ownerId": new mongoose.Types.ObjectId(userId)
        }
      },
      // 3️⃣ Sort newest first
      { $sort: { createdAt: -1 } },
      // 4️⃣ Pagination
      { $skip: skip },
      { $limit: limit },
      // 5️⃣ Project required fields
      {
        $project: {
          _id: 1,
          couponId: 1,
          userId: 1,
          createdAt: 1,
          status: 1,
          serviceStartTime: 1,
          serviceEndTime: 1,
          amount: 1,
          discountAmount: 1,
          finalAmount: 1,
          usedCount: 1,
          "coupon.title": 1,
          "coupon.discountPercentage": 1,
          "coupon.validTill": 1,
          "coupon.isTransferable": 1,
          "coupon.copuon_type": 1
        }
      }
    ];

    const sales = await Salses.aggregate(pipeline);

    // Count total matching sales for pagination
    const countPipeline = [
      {
        $lookup: {
          from: "coupons",
          localField: "couponId",
          foreignField: "_id",
          as: "coupon"
        }
      },
      { $unwind: "$coupon" },
      {
        $match: {
          "coupon.ownerId": new mongoose.Types.ObjectId(userId)
        }
      },
      { $count: "totalSales" }
    ];

    const countResult = await Salses.aggregate(countPipeline);
    const totalSales = countResult.length ? countResult[0].totalSales : 0;

    res.status(200).json({
      success: true,
      page,
      limit,
      totalPages: Math.ceil(totalSales / limit),
      totalSales,
      sales
    });
  } catch (error) {
    console.error("Error fetching sales by coupon owner:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales",
      error: error.message
    });
  }
};



export const completeSale = async (req, res) => {
  try {
    const { saleId, total, final, discount } = req.body;

    if (!saleId || !total) {
      return res.status(400).json({ success: false, message: "Sale ID and total amount are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      return res.status(400).json({ success: false, message: "Invalid Sale ID" });
    }

    const sale = await Salses.findById(saleId);
    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
    if (sale.status === "completed") return res.status(400).json({ success: false, message: "Sale already completed" });

    const coupon = await Coupon.findById(sale.couponId);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    const user = await User.findById(sale.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // 🔹 Update user coupon count
    user.couponCount = Math.max(0, user.couponCount - sale.usedCount);
    await user.save();

    // 🔹 Calculate discount and final amount
    // const totalDiscountPercentage = sale.usedCount * coupon.discountPercentage;
    // const discountAmount = (totalAmount * totalDiscountPercentage) / 100;
    // const finalAmount = totalAmount - discountAmount;

    // 🔹 Update sale
    sale.status = "completed";
    sale.totalAmount = total;
    sale.finalAmount = final;
    sale.discountAmount = discount;
    await sale.save();

    // 🔹 Update coupon distribution
    if (coupon.maxDistributions === 0 || coupon.currentDistributions + sale.usedCount <= coupon.maxDistributions) {
      coupon.currentDistributions += sale.usedCount;
      await coupon.save();
    } else {
      return res.status(400).json({ success: false, message: "Coupon max distribution limit exceeded" });
    }

    return res.status(200).json({
      success: true,
      message: "Sale completed successfully",
      data: {
        saleId: sale._id,
        remainingCoupons: user.couponCount
      }
    });

  } catch (error) {
    console.error("Error completing sale:", error);
    return res.status(500).json({ success: false, message: "Error completing sale", error: error.message });
  }
};



export const cancelSale = async (req, res) => {
  try {
    const userId = req.user.id;
    const { saleId } = req.body;

    if (!saleId) return res.status(400).json({ success: false, message: "Sale ID is required" });
    if (!mongoose.Types.ObjectId.isValid(saleId)) return res.status(400).json({ success: false, message: "Invalid Sale ID" });

    const sale = await Salses.findById(saleId);
    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });

    if (sale.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    if (["completed", "cancelled"].includes(sale.status)) {
      return res.status(400).json({ success: false, message: `Sale already ${sale.status}` });
    }

    // Check 20 min window
    const diffMinutes = Math.floor((new Date() - new Date(sale.serviceStartTime)) / (1000 * 60));
    if (diffMinutes > 20) return res.status(400).json({ success: false, message: "Cancel window expired" });

    // Update sale status
    sale.status = "cancelled";
    await sale.save();

    // Restore coupon count for user
    const userCoupon = await UserCoupon.findOne({ couponId: sale.couponId, userId });
    if (userCoupon) {
      userCoupon.count += sale.usedCount;

      // If previously used, mark back to available
      if (userCoupon.status === "used") {
        userCoupon.status = "available";
        userCoupon.useDate = null;
      }

      await userCoupon.save();
    }

    // Reduce coupon currentDistributions
    const coupon = await Coupon.findById(sale.couponId);
    if (coupon) {
      coupon.currentDistributions -= sale.usedCount;
      if (coupon.currentDistributions < 0) coupon.currentDistributions = 0;
      await coupon.save();
    }

    return res.status(200).json({
      success: true,
      message: "Sale cancelled, coupon count restored, distributions updated",
      data: sale
    });

  } catch (error) {
    console.error("Error cancelling sale:", error);
    return res.status(500).json({ success: false, message: "Error cancelling sale", error: error.message });
  }
};






export const getParticularUserCoupon = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const coupons = await Coupon.find({ ownerId }).lean().exec();

    if (!coupons || coupons.length === 0) {
      return res.status(404).json({
        message: "No coupons found for this user."
      });
    }

    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};








const getall = async (req, res) => {
  try {
    const city = req.query.city;  // Get the city from the query parameter
    const search = req.query.search; // Get the search text from the query parameter

    let filter = {};

    // If user is authenticated
    if (req.user) {
      // Filter for partner type
      if (req.user.type === 'partner') {
        const couponIdList = req.user.createdCouponsId;
        filter._id = { $in: couponIdList };
      }
    }

    // Apply city filter for both authenticated and non-authenticated requests
    if (city && city !== 'all') {
      const usersInCity = await User.find({ 'data.shop_city': city });
      const userIdsInCity = usersInCity.map(user => user._id);
      filter.ownerId = { $in: userIdsInCity };
    }

    // Add a partial match filter for title if search text is provided
    if (search) {
      filter.title = { $regex: search, $options: 'i' }; // Case-insensitive partial match
    }

    // Only show active coupons for non-authenticated users
    if (!req.user) {
      filter.active = true;
    }

    // Fetch coupons based on filters
    const coupons = await Coupon.find(filter);

    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching coupons',
      error: error.message
    });
  }
};





const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the coupon by ID
    const deletedCoupon = await Coupon.findByIdAndDelete(id);
    console.log(deletedCoupon);
    if (!deletedCoupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.status(200).json({ message: 'Coupon deleted successfully', deletedCoupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error deleting coupon',
      error: error.message
    });
  }
};



const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedCoupon = await Coupon.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedCoupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    res.status(200).json({ message: 'Coupon updated successfully', updatedCoupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating coupon',
      error: error.message
    });
  }
}

const availCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    // console.log(id);
    // Find the coupon by the code
    const coupon = await Coupon.findById(id);
    const currentUser = await User.findById(req.user._id);

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    if (!coupon.active) {
      return res.status(400).json({ message: 'Coupon is inactive' });
    }
    if (coupon.maxDistributions && coupon.currentDistributions >= coupon.maxDistributions) {
      return res.status(400).json({ message: 'Coupon has reached its maximum distribution limit' });
    }

    // Check if the user has already availed the coupon

    if (currentUser.availedCouponsId.includes(coupon._id)) {
      return res.status(400).json({ message: 'You have already availed this coupon' });
    }

    // Increment currentDistributions and add user to consumers list
    coupon.currentDistributions++;
    coupon.consumersId.push(req.user._id);

    // Add coupon ID to the user's availedCouponsId
    currentUser.availedCouponsId.push({ couponId: coupon._id });

    // Save both the coupon and user changes
    await coupon.save();
    await currentUser.save();

    res.status(200).json({ message: 'Coupon availed successfully', coupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error availing coupon',
      error: error.message
    });
  }
};

const updateCouponState = async (req, res) => {
  const { id } = req.params; // Coupon ID from request parameters
  const { partnerId, status } = req.body; // Partner ID and new status from request body
  const userId = req.user._id; // User ID from authenticated user

  // Mapping of numeric status values to string representation
  const statusMapping = {
    1: 'ACTIVE',
    2: 'EXPIRED',
    0: 'REDEEMED',
  };

  try {
    // Find the user by ID
    const user = await User.findById(userId);
    console.log(user)

    // Search for the coupon in availedCouponsId by comparing the _id field
    const availedCoupon = user.availedCouponsId.find(coupon => coupon._id.toString() === id);
    // console.log(id);

    if (!availedCoupon) {
      return res.status(404).json({ message: "Coupon not found in availed coupons" });
    }

    // Check if the provided status is valid and update the coupon's status
    if (status in statusMapping) {
      const coupon = await Coupon.findById(availedCoupon.couponId);
      // console.log(coupon.ownerId.toString());
      // console.log(partnerId);
      if (coupon.ownerId.toString() === partnerId) {
        availedCoupon.status = statusMapping[status];
      } else {
        return res.status(403).json({ message: "Coupon owner does not match the provided partner ID" });
      }
    } else {
      return res.status(400).json({ message: "Invalid status provided" });
    }

    // Save the user document with the updated coupon status
    await user.save();

    // Send success response with the updated coupon
    res.json({ message: "Coupon state updated successfully", coupon: availedCoupon });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAvailedCoupon = async (req, res) => {
  try {
    let data = [];
    if (req.user.availedCouponsId != undefined) {
      for (let availedCoupon of req.user.availedCouponsId) {
        // console.log(availedCoupons.consumerId);
        // console.log(availCoupon)
        const coupon = await Coupon.findById(availedCoupon.couponId);
        // console.log(availedCoupon, coupon);
        console.log(coupon);
        data.push({
          ...coupon._doc, ...availedCoupon._doc
        });
        // console.log({
        //    ...availedCoupon._doc, ...coupon._doc
        // });
      }

      res.json(data);
    } else {
      res.status(404).json({ message: 'No availed coupons found' });
    }

  } catch (error) {
    console.error("Error fetching availed coupons:", error);
    res.status(500).json({ message: 'Failed to fetch availed coupons' });
  }
};

const updateAmount = async (req, res) => {
  try {
    const { id } = req.params; // id of the coupon to update
    const { consumerId, amount } = req.body; // consumerId and the new amount (totalprize)

    // Find the user by consumerId
    const user = await User.findById(consumerId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the correct availed coupon by matching the id with _id
    const availedCoupon = user.availedCouponsId.find(coupon => coupon._id.toString() === id);

    if (!availedCoupon) {
      return res.status(404).json({ message: 'Coupon not found in user\'s availed coupons' });
    }

    // Update the totalprize field of the matched coupon
    availedCoupon.totalPrice = amount;

    // Save the updated user document
    await user.save();

    res.status(200).json({ message: 'Coupon amount updated successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating coupon amount',
      error: error.message
    });
  }
}

const storeUsedCoupon = async (req, res) => {
  try {
    let response = [];

    for (let couponId of req.user.createdCouponsId) {
      // console.log(couponId);
      const coupon = await Coupon.findById(couponId);
      // console.log(coupon);

      for (let consumerId of coupon.consumersId) {
        const consumer = await User.findById(consumerId);
        console.log(consumer);

        // Filter consumer's availed coupons based on couponId
        const usedCoupon = consumer.availedCouponsId.filter((singleconsumer) => {
          // console.log(singleconsumer.consumerId, couponId);
          return singleconsumer.couponId.equals(couponId);
        });

        if (usedCoupon.length > 0) {
          response.push({
            consumerData: {
              id: consumer._id,
              ...consumer.data
            },
            couponDetail: usedCoupon
          });
        }
      }
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      message: 'Error storing used coupon',
      error: error.message
    });
  }
}

// const transferCoupon = async (req, res) => {
//   try {
//     const senderId = req.user._id;
//     const { reciverId, transferCount } = req.body;

//     // Fetch the sender and receiver by their IDs
//     const sender = await User.findById(senderId);
//     const reciver = await User.findById(reciverId);

//     // Ensure sender has enough coupons and prevent couponCount from going below 1
//     if (sender.couponCount < transferCount + 1) {
//       return res.status(400).json({ message: 'Insufficient coupons to transfer' });
//     }

//     // Update coupon counts
//     sender.couponCount -= transferCount;
//     reciver.couponCount += transferCount;

//     // Save the updated users
//     await sender.save();
//     await reciver.save();

//     res.status(200).json({ message: 'Coupon(s) transferred successfully' });
//   } catch (error) {
//     res.status(500).json({ message: 'Error transferring coupons', error });
//   }
// };

const transferCouponByPhone = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { phoneNumber, transferCount } = req.body;
    // Fetch the sender and receiver by their IDs
    const sender = await User.findById(senderId);
    // const reciver = await User.findOne({phone: phoneNumber}); 
    const reciver = await User.findOne({ "data.phonenumber": phoneNumber });
    console.log("sender: ", sender);
    console.log("receiver: ", reciver);

    // Ensure sender has enough coupons and prevent couponCount from going below 1
    if (!reciver) {
      return res.status(404).json({ message: 'User not found with the given phone number' });
    }

    if (sender.couponCount < transferCount + 1) {
      return res.status(400).json({ message: 'Insufficient coupons to transfer' });
    }

    // Update coupon counts
    sender.couponCount -= transferCount;
    reciver.couponCount += transferCount;

    // Save the updated users
    await sender.save();
    await reciver.save();

    res.status(200).json({ message: 'Coupon(s) transferred successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Error transferring coupons', error });
  }
}

const getAllCities = async (req, res) => {
  try {
    const { state } = req.body;

    // Create the base query with partner type and non-empty createdCouponsId
    const query = {
      type: "partner",
      createdCouponsId: { $exists: true, $ne: [] }
    };

    // If a state is specified, add it to the query
    if (state) {
      query["data.shop_state"] = state;
    }

    // Fetch users based on the query
    const users = await User.find(query);

    // Extract unique cities
    const cities = new Set();
    users.forEach(user => {
      if (user.data && user.data.shop_city) {
        cities.add(user.data.shop_city);
      }
    });

    // Send back the unique cities as an array
    res.status(200).json({ cities: Array.from(cities) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cities', error });
  }
};

const getCouponCount = async (req, res) => {
  try {
    // Get the user from the request (set by auth middleware)
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Return the coupon count
    res.status(200).json({
      couponCount: user.couponCount,
      message: 'Coupon count retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching coupon count',
      error: error.message
    });
  }
};

export {
  getall,
  deleteCoupon,
  toggleActive,
  updateCoupon,
  availCoupon,
  updateCouponState,
  getAvailedCoupon,
  updateAmount,
  storeUsedCoupon,
  transferCouponByPhone,
  getAllCities,
  getCouponCount

};
