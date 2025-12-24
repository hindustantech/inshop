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
import ReferralUsage from '../models/ReferralUsage.js';
import { sendNotification } from '../utils/SendNotificaion.js';
import Plan from '../models/Plan.js';
import Wallet from '../models/Wallet.js';
import UserPlan from '../models/UserPlan.js';

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

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in kilometers
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
    Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in KM
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}



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
    const { maxDistributions, fromTime, toTime, active, validTill, status } = req.body;

    // Validate couponId
    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ error: "Invalid coupon ID format" });
    }

    // ✅ Allow only these fields
    const allowedUpdates = {};

    // Validate and prepare updates
    if (maxDistributions !== undefined) {
      const maxDistNum = parseInt(maxDistributions);
      if (isNaN(maxDistNum) || maxDistNum < 0) {
        return res.status(400).json({ error: "maxDistributions must be a non-negative number" });
      }
      if (maxDistNum < 1) {
        return res.status(400).json({ error: "maxDistributions must be at least 1" });
      }
      allowedUpdates.maxDistributions = maxDistNum;
    }

    if (fromTime !== undefined) {
      // Validate time format (HH:MM)
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(fromTime)) {
        return res.status(400).json({ error: "fromTime must be in HH:MM format (24-hour)" });
      }
      allowedUpdates.fromTime = fromTime;
    }

    if (toTime !== undefined) {
      // Validate time format (HH:MM)
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(toTime)) {
        return res.status(400).json({ error: "toTime must be in HH:MM format (24-hour)" });
      }
      allowedUpdates.toTime = toTime;
    }

    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: "active must be a boolean" });
      }
      allowedUpdates.active = active;
    }

    if (validTill !== undefined && validTill !== "") {
      const validTillDate = new Date(validTill);
      if (isNaN(validTillDate.getTime())) {
        return res.status(400).json({ error: "validTill must be a valid date" });
      }

      // Check if date is in the future
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0); // Set to start of day for comparison
      validTillDate.setHours(0, 0, 0, 0);

      if (validTillDate <= currentDate) {
        return res.status(400).json({ error: "validTill must be a future date" });
      }

      allowedUpdates.validTill = new Date(validTill);
    }

    if (status !== undefined) {
      const validStatuses = ["draft", "published", "expired", "disabled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
      }
      allowedUpdates.status = status;
    }

    // Check if there's anything to update
    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    // ✅ Update coupon with only allowed fields
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      { $set: allowedUpdates },
      {
        new: true,
        runValidators: true,
        context: 'query' // This helps with custom validators
      }
    ).populate('createdby', 'name phone')
      .populate('category', 'name')
      .populate('ownerId', '_id')
      .populate('promotion', 'name desc')
      .populate('consumersId', '_id')
      .populate('usedCopun', '_id');

    if (!updatedCoupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    res.status(200).json({
      success: true,
      message: "Coupon updated successfully by admin",
      data: updatedCoupon
    });

  } catch (error) {
    console.error("Admin coupon update error:", error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: errors
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Duplicate field value entered"
      });
    }

    res.status(500).json({
      success: false,
      error: "Server error while updating coupon"
    });
  }
};





export const updateCouponFromAdmin = async (req, res) => {
  try {
    const couponId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ success: false, message: 'Invalid coupon ID' });
    }

    const updates = { ...req.body };

    // 1. Handle ownerId by phone number
    if (updates.ownerPhone) {
      const phone = String(updates.ownerPhone).trim();

      if (!phone || phone.length < 10) {
        return res.status(400).json({ success: false, message: 'Valid phone number required for owner' });
      }

      const user = await User.findOne({ phone });

      if (!user) {
        return res.status(404).json({ success: false, message: `User with phone ${phone} not found` });
      }

      updates.ownerId = user._id;
      delete updates.ownerPhone;
    }

    // 2. Handle shope_location
    if (updates.shope_location) {
      try {
        updates.shope_location = typeof updates.shope_location === 'string'
          ? JSON.parse(updates.shope_location)
          : updates.shope_location;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid shope_location format' });
      }
    }

    // 3. Handle Images → Cloudinary (replace all images if new ones uploaded)
    if (req.files && req.files.length > 0) {
      const results = await Promise.all(
        req.files.map(file => uploadToCloudinary(file.buffer, 'coupons'))
      );
      updates.copuon_image = results.map(r => r.secure_url);
    }

    // 4. DISCOUNT: Save exactly what user types (as string)
    if (updates.hasOwnProperty('discountPercentage')) {
      let input = updates.discountPercentage;
      if (input === null || input === undefined) input = '';
      input = String(input).trim();
      updates.discountPercentage = input === '' ? '0' : input;
    }

    // 5. Handle Arrays safely
    ['tag', 'categoryIds', 'is_spacial_copun_user'].forEach(field => {
      if (updates[field] !== undefined) {
        if (typeof updates[field] === 'string') {
          try { updates[field] = JSON.parse(updates[field]); } catch { }
        }
        if (!Array.isArray(updates[field])) updates[field] = [];
      }
    });

    if (updates.categoryIds) {
      updates.category = updates.categoryIds;
      delete updates.categoryIds;
    }

    // 6. STATUS VALIDATION & AUTO ACTIVE FLAG (like in create)
    if (updates.status) {
      const allowedStatus = ["draft", "published", "expired", "disabled"];
      if (!allowedStatus.includes(updates.status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed: ${allowedStatus.join(", ")}`
        });
      }
      // Auto-set active based on status
      updates.active = updates.status === "published";
    }

    // ==== CRITICAL FIX: fromTime / toTime VALIDATION ====
    const isFullDay = updates.isFullDay === true ||
      updates.isFullDay === 'true' ||
      updates.isFullDay === '1';

    if (isFullDay) {
      // Completely remove time fields → Mongoose skips required validation
      delete updates.fromTime;
      delete updates.toTime;
    } else {
      // Not full day → require and validate times
      if (!updates.fromTime || !updates.toTime) {
        return res.status(400).json({
          success: false,
          message: 'fromTime and toTime are required when coupon is not full day'
        });
      }

      // Optional: Validate time format HH:MM (24-hour)
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(updates.fromTime) || !timeRegex.test(updates.toTime)) {
        return res.status(400).json({
          success: false,
          message: 'Time must be in HH:MM format (e.g. 09:30, 14:45)'
        });
      }
    }
    // ==============================================

    // 7. PROTECTED FIELDS – Never allow update
    const protectedFields = [
      'currentDistributions', 'consumersId', 'creationDate',
      'createdBy', 'createdby', 'promotion', '__v'
    ];
    protectedFields.forEach(f => delete updates[f]);

    // 8. Final Update with validation
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select('-consumersId -__v -promotion')
      .populate('category', 'name')
      .populate('ownerId', 'name phone')
      .populate('is_spacial_copun_user', 'name phone referralCode')
      .lean();

    if (!updatedCoupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    return res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: updatedCoupon
    });

  } catch (error) {
    console.error('Update coupon error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: messages.join(', ')
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};




export const createCoupon = async (req, res) => {
  try {
    const {
      shop_name,
      coupon_color = '#FFFFFF',
      title,
      status = 'draft',
      is_spacial_copun_user = [],
      manual_address,
      copuon_srno,
      categoryIds,
      discountPercentage,
      style,
      fromTime,
      toTime,
      isFullDay = false,
      termsAndConditions,
      is_spacial_copun = false,
      isTransferable = false,
      tag,
      shope_location,
      // User CANNOT provide these - they come from plan
      // validityDays, // NOT ALLOWED

      // validFrom,    // NOT ALLOWED
    } = req.body;

    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: user missing" });
    }

    // Check if user wants to create as published
    const wantsToPublish = status === 'published';

    // Fetch ACTIVE User Plan (only if trying to publish)
    let userPlan = null;
    let plan = null;

    if (wantsToPublish) {
      userPlan = await UserPlan.findOne({
        userId,
        status: "active",
      }).populate("planId");

      if (!userPlan) {
        return res.status(403).json({
          success: false,
          message: "No active subscription found. Please purchase a plan to create coupons for publishing.",
        });
      }

      plan = userPlan.planId;
      if (!plan) {
        return res.status(500).json({
          success: false,
          message: "Subscription plan data is corrupted. Please contact support.",
        });
      }

      // Check if plan has validityDaysCoupons
      if (!plan.validityDaysCoupons || plan.validityDaysCoupons <= 0) {
        return res.status(400).json({
          success: false,
          message: "Your plan does not specify coupon validity days. Please contact support.",
        });
      }
    }

    const { createdBy, ownerId, partnerId } = req.ownership || {};
    const finalOwnerId = ownerId || partnerId || createdBy;

    // ===============================
    // VALIDITY DATES: USER CANNOT PROVIDE - THEY COME FROM PLAN WHEN PUBLISHED
    // ===============================
    let planValidityDays = null;

    if (wantsToPublish && plan) {
      planValidityDays = plan.validityDaysCoupons;
      console.log(`Plan provides validity: ${planValidityDays} days`);
    }

    // For now, don't set validity dates - they'll be set when admin publishes
    // Only store the plan's validityDays for reference
    const couponValidityDays = wantsToPublish ? planValidityDays : 15;

    // ===============================
    // Location validation (required for publishable coupons)
    // ===============================
    let location = null;
    if (wantsToPublish && !shope_location) {
      return res.status(400).json({
        message: "shope_location is required for coupons meant to be published"
      });
    }

    if (shope_location) {
      try {
        const parsedLocation =
          typeof shope_location === "string"
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
            message:
              'Invalid shope_location format. Must be { type: "Point", coordinates: [lng, lat], address }',
          });
        }

        location = parsedLocation;
      } catch (err) {
        return res.status(400).json({
          message: "Invalid shope_location JSON",
        });
      }
    }

    // ===============================
    // Time validation (required for publishable coupons)
    // ===============================
    if (wantsToPublish && !isFullDay && (!fromTime || !toTime)) {
      return res.status(400).json({
        message: "fromTime and toTime are required when isFullDay is false for publishable coupons",
      });
    }

    // ===============================
    // Required fields validation for publishable coupons
    // ===============================
    if (wantsToPublish) {
      const requiredFields = {
        shop_name: shop_name,
        title: title,
        manual_address: manual_address,
        discountPercentage: discountPercentage,
        termsAndConditions: termsAndConditions,
        tag: tag,
        categoryIds: categoryIds,
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([key, value]) => !value || (Array.isArray(value) && value.length === 0))
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({
          message: `Missing required fields for publishable coupons: ${missingFields.join(', ')}`,
        });
      }
    }

    // ===============================
    // Tags validation
    // ===============================
    if (tag && (!Array.isArray(tag) || tag.length === 0)) {
      return res.status(400).json({
        message: "Tag must be a non-empty array",
      });
    }

    // ===============================
    // Categories validation
    // ===============================
    let parsedCategoryIds = categoryIds;
    if (typeof categoryIds === "string") {
      try {
        parsedCategoryIds = JSON.parse(categoryIds);
      } catch (err) {
        return res.status(400).json({
          message: "Invalid categoryIds JSON format",
        });
      }
    }

    if (wantsToPublish && (!Array.isArray(parsedCategoryIds) || parsedCategoryIds.length === 0)) {
      return res.status(400).json({
        message: "categoryIds is required and must be a non-empty array for publishable coupons",
      });
    }

    // Validate and fetch categories if provided
    let categories = [];
    if (parsedCategoryIds && Array.isArray(parsedCategoryIds)) {
      const invalidIds = parsedCategoryIds.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id)
      );
      if (invalidIds.length > 0) {
        return res.status(400).json({
          message: `Invalid category IDs: ${invalidIds.join(", ")}`,
        });
      }

      categories = await Category.find({
        _id: { $in: parsedCategoryIds },
      });

      if (wantsToPublish && categories.length !== parsedCategoryIds.length) {
        return res.status(404).json({
          message: "One or more categories not found",
        });
      }
    }

    // ===============================
    // Special Coupon Users validation
    // ===============================
    let parsedSpecialUsers = is_spacial_copun_user;
    if (typeof parsedSpecialUsers === "string") {
      try {
        parsedSpecialUsers = JSON.parse(parsedSpecialUsers);
      } catch (err) {
        return res.status(400).json({
          message: "Invalid is_spacial_copun_user JSON format",
        });
      }
    }

    if (parsedSpecialUsers && !Array.isArray(parsedSpecialUsers)) {
      return res.status(400).json({
        message: "is_spacial_copun_user must be an array",
      });
    }

    // ===============================
    // Upload Images
    // ===============================
    let copuon_image = [];
    if (req.files?.length) {
      const uploads = await Promise.all(
        req.files.map((file) =>
          uploadToCloudinary(file.buffer, "coupons")
        )
      );
      copuon_image = uploads.map((u) => u.secure_url);
    }



    if (req.body.coupon_images) {
      let imageUrls = req.body.coupon_images;

      // If sent as stringified JSON
      if (typeof imageUrls === "string") {
        try {
          imageUrls = JSON.parse(imageUrls);
        } catch {
          imageUrls = [imageUrls]; // single URL case
        }
      }

      if (Array.isArray(imageUrls)) {
        const validUrls = imageUrls.filter(
          (url) => typeof url === "string" && url.startsWith("http")
        );

        copuon_image.push(...validUrls);
      }
    }

    copuon_image = [...new Set(copuon_image)];

    // ===============================
    // Determine final status
    // ===============================
    let finalStatus = status;

    if (wantsToPublish) {
      // If user wants to publish, set as 'disabled' initially (admin will verify)
      finalStatus = 'published';
    } else if (status !== 'draft') {
      // If any other status, default to draft
      finalStatus = 'draft';
    }



    let validTill;

    // 📝 Draft → 15 days from now
    if (!wantsToPublish) {
      validTill = new Date(
        Date.now() + 15 * 24 * 60 * 60 * 1000
      );
    }
    // 🚀 Publish request → use plan validity
    else if (planValidityDays) {
      validTill = new Date(
        Date.now() + planValidityDays * 24 * 60 * 60 * 1000
      );
    }

    // ===============================
    // Create Coupon
    // ===============================
    const couponData = {
      title,
      shop_name,
      coupon_color,
      manul_address: manual_address,
      copuon_srno,
      discountPercentage,
      createdBy,
      ownerId: finalOwnerId,
      createdby: userId,
      validTill,
      // DO NOT set validFrom, validTill, validityDays here
      // They will be set when admin publishes
      style,
      status: finalStatus,
      active: false, // Always false initially, only true when admin sets to 'published'
      fromTime: isFullDay ? undefined : fromTime,
      toTime: isFullDay ? undefined : toTime,
      isFullDay,
      termsAndConditions,
      is_spacial_copun,
      isTransferable,
      copuon_image,
      currentDistributions: 0,
      consumersId: [],
    };

    // Add categories if provided
    if (categories.length > 0) {
      couponData.category = categories.map((c) => c._id);
    }

    // Add tags if provided
    if (tag && Array.isArray(tag) && tag.length > 0) {
      couponData.tag = tag;
    }

    // Add special users if provided
    if (parsedSpecialUsers && Array.isArray(parsedSpecialUsers)) {
      couponData.is_spacial_copun_user = parsedSpecialUsers;
    }

    // Add location if provided
    if (location) {
      couponData.shope_location = location;
    }

    // Add planId only if trying to publish
    if (wantsToPublish && plan?._id) {
      couponData.planId = plan._id;
      couponData.maxDistributions = plan.couponsIncluded || 0;
      // Store plan's validityDays for reference (will be used when admin publishes)
      couponData.planValidityDays = plan.validityDaysCoupons;
    } else {
      couponData.maxDistributions = 0;
    }

    const coupon = await Coupon.create(couponData);

    // ===============================
    // Update UserPlan (only if trying to publish)
    // ===============================
    if (wantsToPublish && userPlan) {
      // Mark plan as used for this coupon
      userPlan.lastUsedAt = new Date();
      userPlan.status = "used";
      await userPlan.save();
    }

    // ===============================
    // ✅ SUCCESS
    // ===============================
    return res.status(201).json({
      success: true,
      message: wantsToPublish
        ? "Coupon created successfully and submitted for admin verification"
        : "Coupon saved as draft successfully",
      coupon,
      note: wantsToPublish
        ? `Your coupon is now in 'published' status. Admin will verify and active it soon. Validity will be ${plan.validityDaysCoupons} days from publication date.`
        : "You can complete and submit this draft for publishing later.",
    });
  } catch (err) {
    console.error("Create coupon error:", err);
    return res.status(500).json({
      message: "Error creating coupon",
      error: err.message,
    });
  }
};

// export const createCouponAdmin = async (req, res) => {
//   try {
//     const {
//       shop_name,
//       coupon_color = "#FFFFFF",
//       title,
//       status = "draft",
//       is_spacial_copun_user = [],
//       manual_address,
//       copuon_srno,
//       categoryIds,
//       discountPercentage,
//       validTill,
//       style,
//       maxDistributions = 0,
//       fromTime,
//       toTime,
//       isFullDay = false,
//       termsAndConditions,
//       is_spacial_copun = false,
//       isTransferable = false,
//       tag,
//       shope_location,
//       planId, // Payment plan ID
//     } = req.body;

//     const adminId = req.user?._id;
//     const adminRole = req.user?.role ||req.user?.type;

//     if (!adminId) {
//       return res.status(401).json({ message: "Unauthorized admin" });
//     }

//     // ================= PAYMENT VALIDATION =================
//     let paymentInfo = null;

//     // Check if payment is required (all except super_admin)
//     if (adminRole !== 'super_admin') {
//       if (!planId) {
//         return res.status(400).json({
//           success: false,
//           message: "Payment required: Please select a plan",
//         });
//       }

//       // Verify payment was successful
//       try {
//         paymentInfo = await verifyCouponPayment(adminId, planId);
//         if (!paymentInfo.success) {
//           return res.status(402).json({
//             success: false,
//             message: "Payment verification failed",
//             error: paymentInfo.message,
//           });
//         }
//       } catch (paymentErr) {
//         return res.status(402).json({
//           success: false,
//           message: "Payment verification error",
//           error: paymentErr.message,
//         });
//       }

//       // Check if user has reached plan limit
//       const plan = await Plan.findById(planId);
//       if (!plan) {
//         return res.status(404).json({
//           success: false,
//           message: "Selected plan not found",
//         });
//       }

//       // Count coupons created in plan duration
//       const startDate = new Date(Date.now() - plan.durationDays * 24 * 60 * 60 * 1000);
//       const userCouponCount = await Coupon.countDocuments({
//         ownerId: adminId,
//         createdAt: { $gte: startDate },
//         status: { $in: ['published', 'draft'] }
//       });

//       if (userCouponCount >= plan.maxCoupons) {
//         return res.status(400).json({
//           success: false,
//           message: `Plan limit reached. Maximum ${plan.maxCoupons} coupons allowed for ${plan.durationDays} days.`,
//           currentCount: userCouponCount,
//           maxLimit: plan.maxCoupons,
//         });
//       }
//     }

//     // ================= BASIC VALIDATION =================
//     if (!shop_name || !title) {
//       return res.status(400).json({
//         success: false,
//         message: "shop_name and title are required",
//       });
//     }

//     const parsedDiscount = Number(discountPercentage);
//     if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
//       return res.status(400).json({
//         success: false,
//         message: "discountPercentage must be between 0 and 100",
//       });
//     }

//     // ================= LOCATION VALIDATION =================
//     let location = null;
//     if (!shope_location) {
//       return res.status(400).json({
//         success: false,
//         message: "shope_location is required"
//       });
//     }

//     try {
//       const parsed = typeof shope_location === "string"
//         ? JSON.parse(shope_location)
//         : shope_location;

//       if (
//         parsed.type !== "Point" ||
//         !Array.isArray(parsed.coordinates) ||
//         parsed.coordinates.length !== 2 ||
//         !parsed.address
//       ) {
//         throw new Error("Invalid location format");
//       }
//       location = parsed;
//     } catch {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid shope_location. Use { type:"Point", coordinates:[lng,lat], address }',
//       });
//     }

//     // ================= TIME VALIDATION =================
//     if (!isFullDay && (!fromTime || !toTime)) {
//       return res.status(400).json({
//         success: false,
//         message: "fromTime & toTime required when isFullDay is false",
//       });
//     }

//     // ================= VALID TILL VALIDATION =================
//     const expiryDate = new Date(validTill);
//     if (isNaN(expiryDate) || expiryDate <= new Date()) {
//       return res.status(400).json({
//         success: false,
//         message: "validTill must be a future date",
//       });
//     }

//     // ================= CATEGORY VALIDATION =================
//     let parsedCategoryIds = typeof categoryIds === "string"
//       ? JSON.parse(categoryIds)
//       : categoryIds;

//     if (!Array.isArray(parsedCategoryIds) || parsedCategoryIds.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "categoryIds must be a non-empty array",
//       });
//     }

//     const categories = await Category.find({
//       _id: { $in: parsedCategoryIds },
//     });

//     if (categories.length !== parsedCategoryIds.length) {
//       return res.status(404).json({
//         success: false,
//         message: "One or more categories not found",
//       });
//     }

//     // ================= SPECIAL USERS VALIDATION =================
//     let parsedSpecialUsers = typeof is_spacial_copun_user === "string"
//       ? JSON.parse(is_spacial_copun_user)
//       : is_spacial_copun_user;

//     if (!Array.isArray(parsedSpecialUsers)) {
//       return res.status(400).json({
//         success: false,
//         message: "is_spacial_copun_user must be an array",
//       });
//     }

//     // ================= IMAGE UPLOAD =================
//     let copuon_image = [];
//     if (req.files?.length) {
//       try {
//         const uploads = await Promise.all(
//           req.files.map((file) =>
//             uploadToCloudinary(file.buffer, "coupons")
//           )
//         );
//         copuon_image = uploads.map((u) => u.secure_url);
//       } catch (uploadErr) {
//         return res.status(500).json({
//           success: false,
//           message: "Failed to upload images",
//           error: uploadErr.message,
//         });
//       }
//     }

//     // ================= ACTIVE FLAG =================
//     const isActive = status === "published";

//     // ================= SAVE COUPON =================
//     const couponData = {
//       title,
//       shop_name,
//       coupon_color,
//       manul_address: manual_address,
//       copuon_srno,
//       discountPercentage: parsedDiscount,
//       category: categories.map((c) => c._id),
//       createdBy: adminId,
//       ownerId: adminId,
//       createdby: adminId,
//       status,
//       active: isActive,
//       validTill: expiryDate,
//       style,
//       maxDistributions,
//       fromTime: isFullDay ? undefined : fromTime,
//       toTime: isFullDay ? undefined : toTime,
//       isFullDay,
//       is_spacial_copun_user: parsedSpecialUsers,
//       termsAndConditions,
//       is_spacial_copun,
//       isTransferable,
//       tag,
//       shope_location: location,
//       copuon_image,
//       currentDistributions: 0,
//       consumersId: [],
//     };

//     // Add payment info if applicable
//     if (adminRole !== 'super_admin' && planId && paymentInfo) {
//       couponData.planId = planId;
//       couponData.paymentStatus = 'completed';
//       couponData.paymentId = paymentInfo.paymentId;
//       couponData.paymentDate = new Date();
//       couponData.planDetails = {
//         name: paymentInfo.planName,
//         price: paymentInfo.planPrice,
//         durationDays: paymentInfo.planDuration,
//         maxCoupons: paymentInfo.planMaxCoupons,
//       };
//     }

//     const coupon = await Coupon.create(couponData);

//     // ================= UPDATE PAYMENT RECORD =================
//     if (adminRole !== 'super_admin' && paymentInfo) {
//       await Payment.findByIdAndUpdate(paymentInfo.paymentId, {
//         couponId: coupon._id,
//         status: 'coupon_created',
//       });
//     }

//     return res.status(201).json({
//       success: true,
//       message: `Coupon created successfully with status '${status}'`,
//       coupon: {
//         _id: coupon._id,
//         title: coupon.title,
//         shop_name: coupon.shop_name,
//         status: coupon.status,
//         discountPercentage: coupon.discountPercentage,
//         validTill: coupon.validTill,
//         paymentStatus: adminRole !== 'super_admin' ? 'paid' : 'free',
//       },
//     });

//   } catch (err) {
//     console.error("Admin coupon creation error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Error creating admin coupon",
//       error: process.env.NODE_ENV === 'development' ? err.message : undefined,
//     });
//   }
// };

// ================= HELPER FUNCTION =================
async function verifyCouponPayment(userId, planId) {
  try {
    // Check for successful payment in the last 15 minutes
    const recentPayment = await Payment.findOne({
      userId,
      planId,
      status: 'completed',
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) }
    }).populate('planId');

    if (!recentPayment) {
      return {
        success: false,
        message: 'No valid payment found. Please complete payment first.'
      };
    }

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return {
        success: false,
        message: 'Plan not found'
      };
    }

    return {
      success: true,
      paymentId: recentPayment._id,
      planName: plan.name,
      planPrice: plan.price,
      planDuration: plan.durationDays,
      planMaxCoupons: plan.maxCoupons,
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    return {
      success: false,
      message: 'Payment verification failed'
    };
  }
}


export const createCouponAdmin = async (req, res) => {
  try {
    const {
      shop_name,
      coupon_color = "#FFFFFF",
      title,
      status = "published", // ✅ ADMIN CONTROLS STATUS
      is_spacial_copun_user = [],
      manual_address,
      copuon_srno,
      categoryIds,
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

    const adminId = req.user?._id;
    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized admin" });
    }

    // ---------------- STATUS VALIDATION ----------------
    const allowedStatus = ["draft", "published", "disabled", "expired"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed: ${allowedStatus.join(", ")}`,
      });
    }

    // ---------------- BASIC VALIDATION ----------------
    if (!shop_name || !title) {
      return res.status(400).json({
        message: "shop_name and title are required",
      });
    }

    const parsedDiscount = Number(discountPercentage);
    if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      return res.status(400).json({
        message: "discountPercentage must be between 0 and 100",
      });
    }

    // ---------------- LOCATION ----------------
    let location = null;
    if (!shope_location) {
      return res.status(400).json({ message: "shope_location is required" });
    }

    try {
      const parsed =
        typeof shope_location === "string"
          ? JSON.parse(shope_location)
          : shope_location;

      if (
        parsed.type !== "Point" ||
        !Array.isArray(parsed.coordinates) ||
        parsed.coordinates.length !== 2 ||
        !parsed.address
      ) {
        throw new Error();
      }
      location = parsed;
    } catch {
      return res.status(400).json({
        message:
          'Invalid shope_location. Use { type:"Point", coordinates:[lng,lat], address }',
      });
    }

    // ---------------- TIME ----------------
    if (!isFullDay && (!fromTime || !toTime)) {
      return res.status(400).json({
        message: "fromTime & toTime required when isFullDay is false",
      });
    }

    // ---------------- VALID TILL ----------------
    const expiryDate = new Date(validTill);
    if (isNaN(expiryDate) || expiryDate <= new Date()) {
      return res.status(400).json({
        message: "validTill must be a future date",
      });
    }

    // ---------------- CATEGORY ----------------
    let parsedCategoryIds =
      typeof categoryIds === "string"
        ? JSON.parse(categoryIds)
        : categoryIds;

    if (!Array.isArray(parsedCategoryIds) || parsedCategoryIds.length === 0) {
      return res.status(400).json({
        message: "categoryIds must be a non-empty array",
      });
    }

    const categories = await Category.find({
      _id: { $in: parsedCategoryIds },
    });

    if (categories.length !== parsedCategoryIds.length) {
      return res.status(404).json({
        message: "One or more categories not found",
      });
    }

    // ---------------- SPECIAL USERS ----------------
    let parsedSpecialUsers =
      typeof is_spacial_copun_user === "string"
        ? JSON.parse(is_spacial_copun_user)
        : is_spacial_copun_user;

    if (!Array.isArray(parsedSpecialUsers)) {
      return res.status(400).json({
        message: "is_spacial_copun_user must be an array",
      });
    }

    // ---------------- IMAGES ----------------
    let copuon_image = [];
    if (req.files?.length) {
      const uploads = await Promise.all(
        req.files.map((file) =>
          uploadToCloudinary(file.buffer, "coupons")
        )
      );
      copuon_image = uploads.map((u) => u.secure_url);
    }

    // ---------------- ACTIVE FLAG ----------------
    /* ======================
   🔹 Resolve Active State (Server Authority)
====================== */
    const isActive =
      userType === "super_admin" && status === "published"
        ? true
        : false;


    // ---------------- SAVE COUPON ----------------
    const coupon = await Coupon.create({
      title,
      shop_name,
      coupon_color,
      manul_address: manual_address,
      copuon_srno,
      discountPercentage: parsedDiscount,
      category: categories.map((c) => c._id),
      createdBy: adminId,
      ownerId: adminId,
      createdby: adminId,
      status,                 // ✅ STATUS DRIVES EVERYTHING
      active: isActive,       // ✅ published → true
      validTill: expiryDate,
      style,
      maxDistributions,
      fromTime: isFullDay ? undefined : fromTime,
      toTime: isFullDay ? undefined : toTime,
      isFullDay,
      is_spacial_copun_user: parsedSpecialUsers,
      termsAndConditions,
      is_spacial_copun,
      isTransferable,
      tag,
      shope_location: location,
      copuon_image,
      currentDistributions: 0,
      consumersId: [],
    });

    return res.status(201).json({
      success: true,
      message: `Coupon created successfully with status '${status}'`,
      coupon,
    });

  } catch (err) {
    console.error("Admin coupon error:", err);
    return res.status(500).json({
      message: "Error creating admin coupon",
      error: err.message,
    });
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

    // Role-based filter
    if (req.user.type === "agency") {
      filter.createdby = new mongoose.Types.ObjectId(req.user.id);
    } else if (req.user.type === "super_admin" || req.user.type === "admin") {
      // Super admin & admin can view all coupons → no filter restriction
    } else {
      // Any other user type is denied
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Search filter
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ title: regex }, { tag: { $in: [regex] } }];
    }

    // Tag filter
    if (tag) filter.tag = { $in: [tag] };

    // Category filter
    if (category && mongoose.Types.ObjectId.isValid(category))
      filter.category = category;

    // Active / Inactive filter
    if (status === "active") filter.active = true;
    else if (status === "inactive") filter.active = false;

    // Date range filter
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

    // Dynamic summary filter (same as role filter)
    const summaryFilter = { ...filter };

    const now = new Date();
    const expiringSoonDate = new Date();
    expiringSoonDate.setDate(now.getDate() + 7);

    const [total, activeCount, inactiveCount, expiringSoonCount] = await Promise.all([
      Coupon.countDocuments(summaryFilter),
      Coupon.countDocuments({ ...summaryFilter, active: true }),
      Coupon.countDocuments({ ...summaryFilter, active: false }),
      Coupon.countDocuments({
        ...summaryFilter,
        active: true,
        validTill: { $gte: now, $lte: expiringSoonDate },
      }),
    ]);

    // CSV Export
    if (exportCSV) {
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
    }

    // Normal Pagination
    let coupons = await query.skip(skip).limit(Number(limit)).lean();

    // Add used count for each coupon
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
export const getOwnerDraftExpiredCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    const coupon = await Coupon.findOne({
      _id: id,
      ownerId,
      status: { $in: ["draft", "expired", "disabled"] },
    })
      .populate("category", "name")
      .populate("ownerId", "name phone")
      .lean()           // ⚡ performance
      .exec();

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found, already published, or access denied",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon fetched successfully",
      data: coupon,
    });

  } catch (error) {
    console.error("Error fetching coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
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

    // Enhanced category validation
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

    // 6️⃣ Get referred users for the logged-in user (if applicable)
    let referredUserIds = [];
    if (userId) {
      // Find users who were referred by special coupon users
      const specialCouponUsers = await Coupon.find({ is_spacial_copun: true })
        .distinct('is_spacial_copun_user');
      const referralUsages = await ReferralUsage.find({
        referrerId: { $in: specialCouponUsers },
      }).distinct('referredUserId');
      referredUserIds = referralUsages.map(id => new mongoose.Types.ObjectId(id));
    }

    // 7️⃣ Build match query for geoNear
    const geoQuery = {
      ...(categoryFilter ? { category: categoryFilter } : {}),
    };

    // 8️⃣ Build aggregation pipeline
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
          // Filter for special coupons
          {
            $match: {
              $or: [
                { is_spacial_copun: false }, // Non-special coupons are visible to all
                {
                  is_spacial_copun: true,
                  $or: [
                    { is_spacial_copun_user: userId }, // User is in special coupon user list
                    { is_spacial_copun_user: { $in: referredUserIds } }, // User was referred by a special coupon user
                  ],
                },
              ],
            },
          },
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
          // For guest users, only show non-special coupons
          {
            $match: {
              is_spacial_copun: false,
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

    // 9️⃣ Count pipeline
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
          // Filter for special coupons
          {
            $match: {
              $or: [
                { is_spacial_copun: false },
                {
                  is_spacial_copun: true,
                  $or: [
                    { is_spacial_copun_user: userId },
                    { is_spacial_copun_user: { $in: referredUserIds } },
                  ],
                },
              ],
            },
          },
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
              is_spacial_copun: false,
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

    const sendercodes = sender.latestLocation?.coordinates || [];
    const receivercodes = receiver.latestLocation?.coordinates || [];
    if (sendercodes.length !== 2 || receivercodes.length !== 2) {
      throw new Error("Sender or receiver location not found");
    }
    const distance = getDistanceFromLatLonInKm(
      sendercodes[1],
      sendercodes[0],
      receivercodes[1],
      receivercodes[0]
    );
    if (distance > 100) {
      throw new Error("Receiver is out of transfer range (100 km)");
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

    if (sender.couponCount < 3) {
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

    let receiverAvailableCoupon = await UserCoupon.findOne({
      userId: receiverId,
      couponId,
      status: 'available'
    }).session(session);

    let reciverTranferCoupon = await UserCoupon.findOne({
      userId: receiverId,
      couponId,
      status: 'transferred'
    }).session(session);



    let senderCoupon = await UserCoupon.findOne({ userId: senderId, couponId }).session(session);
    let senderTranferCoupon = await UserCoupon.findOne({
      userId: receiverId,
      couponId,
      senders: { $elemMatch: { senderId: senderId } }
    }).session(session)

    if (senderTranferCoupon) {

      throw new Error("Sender Can not ")
    };

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
      await senderCoupon.save({ session });
    }

    if (receiverUsedCoupon && receiverUsedCoupon.status === 'used') {
      receiverUsedCoupon.status = 'available';
      receiverUsedCoupon.senders.push({ senderId, sentAt: new Date() });
      receiverUsedCoupon.count += 1;
      receiverUsedCoupon.qrCode = qrCode;
      await receiverUsedCoupon.save({ session });

    } else if (receiverAvailableCoupon && receiverUsedCoupon.status === 'available') {
      receiverUsedCoupon.senders.push({ senderId, sentAt: new Date() });
      receiverUsedCoupon.count += 1;
      receiverUsedCoupon.qrCode = qrCode;
      await receiverUsedCoupon.save({ session });
    }
    else if (reciverTranferCoupon) {
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
    else {
      const newUserCoupon = new UserCoupon({
        couponId,
        userId: receiverId,
        status: 'available',
        senders: [{ senderId, sentAt: new Date() }],
        count: 2,
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

    console.log("Start the notification......")
    if (sender.devicetoken) {
      console.log("devicetoken  found the notification......")
      await sendNotification(
        sender.devicetoken,
        "Coupon Transferred 📤",
        `You have successfully transferred the coupon "${coupon.title}" to ${receiver.name || "a user"}.`,
        { type: "coupon_transferred", couponId: coupon._id.toString() }
      );
      console.log("Notification send succesfully  found the notification......")
    }

    if (receiver.devicetoken) {
      console.log("devicetoken  found the notification......")

      await sendNotification(
        receiver.devicetoken,
        "Coupon Received 🎁",
        `${sender.name || "Someone"} has sent you a coupon "${coupon.title}".`,
        { type: "coupon_received", couponId: coupon._id.toString() }
      );
      console.log("Notification send succesfully  found the notification......")

    }


    await session.commitTransaction();
    return res.status(200).json({ success: true, message: "Coupon transferred" });

  } catch (error) {
    await session.abortTransaction();
    return res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};





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



    // 🔹 Update coupon distribution
    if (coupon.maxDistributions === 0 || coupon.currentDistributions + useCount <= coupon.maxDistributions) {
      coupon.currentDistributions += useCount;
      await coupon.save();
    } else {
      return res.status(400).json({ success: false, message: "Coupon max distribution limit exceeded" });
    }

    // ✅ Check if user already has this coupon
    let userCoupon = await UserCoupon.findOne({ couponId, userId });

    if (userCoupon) {
      if (userCoupon.status === "used") {
        return res.status(400).json({ success: false, message: "Coupon already fully used" });
      }
      // if (["cancelled", "transferred"].includes(userCoupon.status)) {
      //   return res.status(400).json({ success: false, message: `Coupon already ${userCoupon.status}` });
      // }

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


        // 🔔 Send notification to claimer
        const user = await User.findById(userId);
        if (user?.devicetoken) {
          await sendNotification(
            user.devicetoken,
            "Coupon Claimed 🎉",
            `You successfully claimed the coupon "${coupon.title}".`,
            { type: "coupon_claimed", couponId: coupon._id.toString() }
          );
        }

        // 🔔 Notify the owner (optional)
        if (ownerUser?.devicetoken) {
          await sendNotification(
            ownerUser.devicetoken,
            "Coupon Used 💡",
            `${user.name || 'Someone'} has used your coupon "${coupon.title}".`,
            { type: "coupon_used", couponId: coupon._id.toString() }
          );
        }
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
      usedCount: useCount
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
      // 3️⃣ Join with User collection to get user details
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } }, // Preserve sales if user is not found
      // 4️⃣ Sort newest first
      { $sort: { createdAt: -1 } },
      // 5️⃣ Pagination
      { $skip: skip },
      { $limit: limit },
      // 6️⃣ Project required fields, including user name
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
          "coupon.title": 1,
          "coupon.discountPercentage": 1,
          "coupon.validTill": 1,
          "coupon.isTransferable": 1,
          "coupon.copuon_type": 1,
          "user.name": 1 // Include the user's name
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


    // 🔔 Send Notification
    if (user.devicetoken) {
      await sendNotification(
        user.devicetoken,
        "Sale Completed ✅",
        `Your purchase using coupon "${coupon.title}" is successfully completed.`,
        { type: "sale_completed", saleId: sale._id.toString() }
      );
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

    // if (sale.userId.toString() !== userId.toString()) {
    //   return res.status(403).json({ success: false, message: "Not authorized" });
    // }

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



    const user = await User.findById(userId);
    if (user?.devicetoken) {
      await sendNotification(
        user.devicetoken,
        "Sale Cancelled ❌",
        `Your sale using coupon "${coupon?.title || 'Unknown'}" was cancelled successfully.`,
        { type: "sale_cancelled", saleId: sale._id.toString() }
      );
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
