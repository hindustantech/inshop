
import Coupon from '../models/coupunModel.js';
import User from '../models/userModel.js';
import UserCoupon from '../models/UserCoupon.js';
import { uploadToCloudinary } from '../utils/Cloudinary.js';
import mongoose from 'mongoose';
import ManualAddress from '../models/ManualAddress.js';
import Salses from '../models/Sales.js'
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
      { expiresIn: "10m" } // 10 minutes
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

// helper for image upload

export const createCoupon = async (req, res) => {
  try {
    const {
      title,
      manual_address, // Fixed typo
      copuon_srno,
      categoryId,
      discountPercentage,
      validTill,
      style,
      active = true,
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

    if (
      !title?.trim() ||
      !manual_address?.trim() ||
      !copuon_srno?.trim() ||
      !categoryId?.trim() ||
      isNaN(parseFloat(discountPercentage)) ||
      !validTill?.trim() ||
      !termsAndConditions?.trim()
    ) {
      return res.status(400).json({
        message:
          "Missing or invalid required fields: title, manual_address, copuon_srno, categoryId, discountPercentage, validTill, termsAndConditions",
      });
    }

    // Parse discountPercentage
    const parsedDiscount = parseFloat(discountPercentage);
    if (parsedDiscount < 0 || parsedDiscount > 100) {
      return res.status(400).json({
        message: "discountPercentage must be between 0 and 100",
      });
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
          message:
            'Invalid shope_location format. Must be { type: "Point", coordinates: [lng, lat] }',
        });
      }
      location = parsedLocation;
    } catch (error) {
      return res.status(400).json({ message: "Invalid shope_location JSON", error: error.message });
    }

    // Time check
    if (!isFullDay && (!fromTime || !toTime)) {
      return res.status(400).json({
        message: "fromTime and toTime are required when isFullDay is false",
      });
    }

    // Validate tag
    if (!tag || !Array.isArray(tag) || tag.length === 0) {
      return res.status(400).json({ message: "At least one tag is required" });
    }

    // Validate validTill
    if (new Date(validTill) <= new Date() || isNaN(new Date(validTill).getTime())) {
      return res.status(400).json({ message: "validTill must be a valid future date" });
    }

    // Validate category
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid categoryId" });
    }

    const categoryDoc = await Category.findById(categoryId);
    if (!categoryDoc) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Handle Images
    let copuon_image = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadPromises = req.files.map((file) =>
          uploadToCloudinary(file.buffer, "coupons")
        );
        const uploadResults = await Promise.all(uploadPromises);
        copuon_image = uploadResults.map((result) => result.secure_url);
      } catch (error) {
        return res.status(500).json({
          message: "Error uploading images to Cloudinary",
          error: error.message,
        });
      }
    }

    // Save Coupon
    const newCoupon = new Coupon({
      title,
      manul_address: manual_address,
      copuon_srno,
      category: categoryDoc._id,
      discountPercentage: parsedDiscount,
      createdBy,
      ownerId: ownerId || partnerId,   // ✅ agar ownerId na ho to partnerId

      createdby: userId,   // ✅ fix
      // partnerId: partnerId || undefined,
      validTill: new Date(validTill),
      style,
      active,
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
              $geometry: { type: 'Point', coordinates: location.coordinates },
              $maxDistance: 50 * 1000, // 50 km in meters
            },
          },
          devicetoken: { $ne: null },
        },
        { uid: 1, name: 1, devicetoken: 1, _id: 0 }
      );

      if (users.length > 0) {
        const batchSize = 500; // Firebase multicast limit
        const batches = [];
        for (let i = 0; i < users.length; i += batchSize) {
          const batchTokens = users.slice(i, i + batchSize).map(user => user.devicetoken);
          batches.push({
            notification: {
              title: `New Coupon: ${title}`,
              body: `A new ${parsedDiscount}% off coupon is available near you! Valid until ${new Date(validTill).toLocaleDateString()}.`,
            },
            tokens: batchTokens,
          });
        }

        // Send all batches concurrently using Promise.all
        const responses = await Promise.all(
          batches.map(batch => admin.messaging().sendMulticast(batch))
        );

        // Aggregate results
        let successCount = 0;
        let failureCount = 0;
        responses.forEach((response, idx) => {
          successCount += response.successCount;
          failureCount += response.failureCount;
          if (response.failureCount > 0) {
            response.responses.forEach((resp, j) => {
              if (!resp.success) {
                console.log(`Error for user ${users[idx * batchSize + j]?.uid}: ${resp.error?.message}`);
              }
            });
          }
        });

        console.log(`Notifications sent: ${successCount} successes, ${failureCount} failures`);
      } else {
        console.log('No users found within 50 km with valid device tokens');
      }
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError);
      // Continue with coupon creation response even if notifications fail
    }
    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon: savedCoupon,
    });
  } catch (err) {
    console.error("Create coupon error:", err);
    return res.status(500).json({
      message: "Error creating coupon",
      error: err.message,
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
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      page = 1,
      limit = 10,
      search,
      tag,
      category,
      exportCSV
    } = req.query;

    let filter = {};
    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { tags: { $in: [search] } }
      ];
    }
    if (tag) filter.tags = { $in: [tag] };
    if (category && mongoose.Types.ObjectId.isValid(category)) filter.category = category;

    const skip = (page - 1) * limit;

    let query = Coupon.find(filter)
      .populate("category", "name")
      .populate("createdby", "name phone type")
      .populate("ownerId", "name phone type");

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
    const exportData = allCoupons.map(c => ({
      Title: c.title,
      Discount: c.discount,
      Category: c.category?.name,
      CreatedBy: c.createdby?.name,
      OwnerBy: c.ownerId?.name,
      CreatedAt: c.createdAt,
    }));
    return exportToCSV(res, exportData, "all_coupons.csv");
  } catch (error) {
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
//       userId = mongoose.Types.ObjectId(req.user.id);
//     }

//     // Validate query parameters
//     const { radius = 100000, search = '', page = 1, limit = 50, manualCode, lat, lng } = req.query;
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

//     const skip = (parsedPage - 1) * parsedLimit;

//     let mode = userId ? 'user' : 'guest';
//     let baseLocation = null;
//     let effectiveRadius = parsedRadius;

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
//           // Guest or no user location: Use manual location as base
//           baseLocation = manualLocation.location;
//           mode = 'manual';
//           effectiveRadius = null; // No radius limit for manual location
//         } else {
//           // Logged-in user: Check distance from manual location
//           const check = await ManualAddress.aggregate([
//             {
//               $geoNear: {
//                 near: baseLocation,
//                 distanceField: 'distance',
//                 spherical: true,
//                 query: { uniqueCode: manualCode },
//                 limit: 1,
//               },
//             },
//             { $project: { distance: 1 } },
//           ]);

//           const distance = check[0]?.distance || 0;
//           if (distance > 100000) {
//             mode = 'manual';
//             baseLocation = manualLocation.location;
//             effectiveRadius = null;
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

//     // 4️⃣ Fallback: Default location (center of India)
//     if (!baseLocation) {
//       baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] };
//       mode = 'default';
//     }

//     // 5️⃣ Build search regex (sanitize input)
//     const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

//     // 6️⃣ Build aggregation pipeline
//     const dataPipeline = [
//       // Match active coupons and validTill in the future or null
//       {
//         $match: {
//           active: true,
//           $or: [
//             { validTill: { $gt: new Date() } },
//             { validTill: null },
//           ],
//         },
//       },
//       // GeoNear for location-based filtering
//       {
//         $geoNear: {
//           near: baseLocation,
//           distanceField: 'distance',
//           ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
//           spherical: true,
//           key: 'shope_location',
//         },
//       },
//       // Search filter
//       ...(search.trim()
//         ? [
//           {
//             $match: {
//               $or: [
//                 { manual_address: searchRegex },
//                 { title: searchRegex },
//                 { tag: searchRegex },
//               ],
//             },
//           },
//         ]
//         : []),
//       // Lookup user coupon status (skip for guests)
//       {
//         $lookup: {
//           from: 'usercoupons',
//           let: { couponId: '$_id' },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $eq: ['$couponId', '$$couponId'] },
//                     ...(userId ? [{ $eq: ['$userId', userId] }] : []),
//                   ],
//                 },
//               },
//             },
//             { $project: { status: 1, _id: 0 } },
//           ],
//           as: 'userStatus',
//         },
//       },
//       // Flatten userStatus array
//       { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
//       // Add displayTag based on userStatus or fallback to 'Not Claimed'
//       {
//         $addFields: {
//           displayTag: {
//             $switch: {
//               branches: [
//                 { case: { $eq: ['$userStatus.status', 'used'] }, then: 'Used' },
//                 { case: { $eq: ['$userStatus.status', 'transferred'] }, then: 'Transferred' },
//                 { case: { $eq: ['$userStatus.status', 'available'] }, then: 'Available' },
//                 { case: { $eq: ['$userStatus.status', 'cancelled'] }, then: 'Cancelled' },
//               ],
//               default: { $ifNull: [{ $arrayElemAt: ['$tag', 0] }, 'Not Claimed'] },
//             },
//           },
//         },
//       },
//       // Project necessary fields
//       {
//         $project: {
//           title: 1,
//           coupon_image: 1,
//           manual_address: 1,
//           coupon_srno: 1,
//           discountPercentage: 1,
//           validTill: 1,
//           displayTag: 1,
//           distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
//         },
//       },
//       // Sort by distance and validTill
//       { $sort: { distance: 1, validTill: -1 } },
//       // Pagination
//       { $skip: skip },
//       { $limit: parsedLimit },
//     ];

//     const coupons = await Coupon.aggregate(dataPipeline);

//     // 7️⃣ Count total for pagination
//     const countPipeline = [
//       {
//         $match: {
//           active: true,
//           $or: [
//             { validTill: { $gt: new Date() } },
//             { validTill: null },
//           ],
//         },
//       },
//       {
//         $geoNear: {
//           near: baseLocation,
//           distanceField: 'distance',
//           ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
//           spherical: true,
//           key: 'shope_location',
//         },
//       },
//       ...(search.trim()
//         ? [
//           {
//             $match: {
//               $or: [
//                 { manual_address: searchRegex },
//                 { title: searchRegex },
//                 { tag: searchRegex },
//               ],
//             },
//           },
//         ]
//         : []),
//       { $count: 'total' },
//     ];

//     const totalResult = await Coupon.aggregate(countPipeline);
//     const total = totalResult[0]?.total || 0;

//     // 8️⃣ Send response
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
    // Enhanced category validation
    let categoryId = null;
    if (category) {
      if (!mongoose.isValidObjectId(category)) {
        return res.status(400).json({ success: false, message: 'Invalid category ID' });
      }
      // Optional: Verify category exists in the Category collection
      const categoryExists = await Category.findById(category).select('_id');
      if (!categoryExists) {
        return res.status(400).json({ success: false, message: 'Category not found' });
      }
      categoryId = new mongoose.Types.ObjectId(category);
    }

    const skip = (parsedPage - 1) * parsedLimit;

    let mode = userId ? 'user' : 'guest';
    let baseLocation = null;
    let effectiveRadius = parsedRadius;
    let sortByLatest = false; // Flag to sort by latest in default case

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
          effectiveRadius = null; // No radius limit for manual location
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
            effectiveRadius = null;
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
      effectiveRadius = null; // No radius limit to show all active coupons
      sortByLatest = true; // Prioritize latest coupons
    }

    // 5️⃣ Build search regex (sanitize input)
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    // 6️⃣ Build match query for geoNear
    const geoQuery = {
      active: true,
      $or: [
        { validTill: { $gt: new Date() } },
        { validTill: null },
      ],
      ...(categoryId ? { category: categoryId } : {}), // Use validated categoryId
    };

    // 7️⃣ Build aggregation pipeline
    const dataPipeline = [
      // GeoNear as first stage with query
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
      // Search filter
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
      // Lookup user coupon status (skip if no userId)
      ...(userId ? [
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
              { $project: { status: 1, _id: 0 } },
            ],
            as: 'userStatus',
          },
        },
        { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            displayTag: {
              $switch: {
                branches: [
                  { case: { $eq: ['$userStatus.status', 'used'] }, then: 'Used' },
                  { case: { $eq: ['$userStatus.status', 'transferred'] }, then: 'Transferred' },
                  { case: { $eq: ['$userStatus.status', 'available'] }, then: 'Available' },
                  { case: { $eq: ['$userStatus.status', 'cancelled'] }, then: 'Cancelled' },
                ],
                default: { $ifNull: [{ $arrayElemAt: ['$tag', 0] }, 'Not Claimed'] },
              },
            },
          },
        },
      ] : [
        {
          $addFields: {
            displayTag: { $ifNull: [{ $arrayElemAt: ['$tag', 0] }, 'Not Claimed'] },
          },
        },
      ]),
      // Project necessary fields
      {
        $project: {
          title: 1,
          coupon_image: 1,
          manual_address: 1,
          coupon_srno: 1,
          discountPercentage: 1,
          validTill: 1,
          displayTag: 1,
          distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
        },
      },
      // Sort by latest (validTill or createdAt) for default mode, else by distance
      { $sort: sortByLatest ? { validTill: -1, createdAt: -1 } : { distance: 1, validTill: -1 } },
      // Pagination
      { $skip: skip },
      { $limit: parsedLimit },
    ];

    const coupons = await Coupon.aggregate(dataPipeline);

    // 8️⃣ Count total for pagination
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
      { $count: 'total' },
    ];

    const totalResult = await Coupon.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    // 9️⃣ Send response
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
  try {
    const senderId = req.user._id; // Authenticated user's ID
    const { receiverId, couponId } = req.body;
    const count = 1
    // Validate input
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ success: false, message: 'Invalid receiver ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ success: false, message: 'Invalid coupon ID' });
    }

    // Fetch sender, receiver, and coupon
    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);
    const coupon = await Coupon.findById(couponId);

    // Check if sender and receiver exist
    if (!sender) {
      return res.status(404).json({ success: false, message: 'Sender not found' });
    }
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'Receiver not found' });
    }
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    // Check if coupon is active
    if (!coupon.active) {
      return res.status(400).json({ success: false, message: 'Coupon is not active' });
    }

    // Check if coupon is expired
    if (coupon.validTill && new Date(coupon.validTill) < new Date()) {
      return res.status(400).json({ success: false, message: 'Coupon is expired' });
    }

    // Check if coupon is special (not transferable if special)
    if (coupon.is_spacial_copun) {
      return res.status(400).json({ success: false, message: 'Special coupons cannot be transferred' });
    }

    // Check if coupon is transferable
    if (!coupon.isTransferable) {
      return res.status(400).json({ success: false, message: 'This coupon is not transferable' });
    }

    // Check distribution limits
    if (coupon.maxDistributions > 0 && coupon.currentDistributions >= coupon.maxDistributions) {
      return res.status(400).json({ success: false, message: 'Maximum distributions reached for this coupon' });
    }

    // Check if receiver already has this coupon
    const receiverUserCoupon = await UserCoupon.findOne({
      userId: receiverId,
      couponId,
    });
    if (receiverUserCoupon) {
      return res.status(400).json({ success: false, message: 'Receiver already has this coupon' });
    }

    // Ensure sender has enough couponCount
    if (sender.couponCount < 2) {
      return res.status(400).json({ success: false, message: 'Sender has insufficient coupon count to transfer' });
    }

    // Check if sender has the coupon in UserCoupon with status 'available'
    let senderUserCoupon = await UserCoupon.findOne({
      userId: senderId,
      couponId,
      $or: [
        { senders: { $size: 0 } }, // Coupon created by sender (no senders)
        { 'senders.senderId': senderId }, // Sender is in the senders array
      ],
    });

    // If no UserCoupon found, check if sender is the owner
    if (senderUserCoupon) {

      return res.status(400).json({
        success: false,
        message: ' This Copun is not tranfer you because  you  already  used this copun',
      });

      // If sender is the owner, proceed without a UserCoupon entry
    }

    // Generate a QR code if none exists (or reuse existing one if senderUserCoupon exists)
    const qrCode = senderUserCoupon ? senderUserCoupon.qrCode : `qr-${couponId}-${Date.now()}`; // Placeholder; replace with actual QR code generation if needed

    // If sender has a UserCoupon, mark it as transferred
    if (!senderUserCoupon) {

      try {
        // Create a new coupon instead of trying to update a null one
        const newCoupon = new UserCoupon({
          status: 'transferred',
          transferredTo: receiverId,
          transferDate: new Date(),
          count: count - 1,
          qrCode
          // add other required fields here
        });
        await newCoupon.save();

      } catch (error) {
        res.status(500).json({
          success: true,
          message: "Error in the tranfered copun"
        })
      }




    }

    // Create new UserCoupon for receiver
    const newUserCoupon = new UserCoupon({
      couponId,
      userId: receiverId,
      status: 'available',
      senders: [{ senderId, sentAt: new Date() }],
      count: count + 1,
      qrCode
    });

    await newUserCoupon.save();


    // Update couponCount for sender and receiver
    sender.couponCount -= 1;
    receiver.couponCount += 1;
    await sender.save();
    await receiver.save();

    res.status(200).json({
      success: true,
      message: 'Coupon transferred successfully',
      couponId,
      receiverId,
    });
  } catch (error) {
    console.error('Error transferring coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error transferring coupon',
      error: error.message,
    });
  }
};




// controllers/couponController.js

export const claimCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const { couponId, useCount = 1, ownerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ success: false, message: "Invalid Coupon ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({ success: false, message: "Invalid owner ID" });
    }

    const coupon = await Coupon.findOne({ _id: couponId, ownerId });

    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    if (new Date() > coupon.validTill) return res.statu(400).json({ success: false, message: "Coupon expired" });

    if (coupon.maxDistributions > 0 && coupon.currentDistributions >= coupon.maxDistributions) {
      return res.status(400).json({
        success: false,
        message: "Coupon limit reached"
      });
    }
    let existingClaim = await UserCoupon.findOne({ couponId, userId });

    if (existingClaim) {
      if (existingClaim.status === "used") return res.status(400).json({ success: false, message: "Coupon already used" });
      if (["cancelled", "transferred"].includes(existingClaim.status)) return res.status(400).json({ success: false, message: `Coupon already ${existingClaim.status}` });

      if (existingClaim.status === "available") {
        let totalCount = existingClaim.count - useCount;
        if (totalCount < 0) totalCount = 0;

        existingClaim.count = totalCount;
        if (existingClaim.count === 0) {
          existingClaim.status = "used";
          existingClaim.useDate = new Date();
        }

        await existingClaim.save();

        // Create ongoing sale (amount will be charged later)
        const sale = new Salses({
          couponId,
          userId,
          serviceStartTime,
          serviceEndTime,
          status: "ongoing",
          usedCount: useCount
        });
        await sale.save();

        return res.status(200).json({ success: true, message: "Coupon count reduced and sale record created (pending payment)", data: { userCoupon: existingClaim, sale } });
      }
    }

    // New claim
    const initialCount = useCount > 2 ? 2 : useCount;
    const userCoupon = new UserCoupon({
      couponId,
      userId,
      qrCode: `COUPON-${couponId}-${userId}-${Date.now()}`,
      status: "available",
      count: initialCount
    });
    await userCoupon.save();

    const sale = new Salses({
      couponId,
      userId,
      serviceStartTime,
      serviceEndTime,
      status: "ongoing",
      usedCount: initialCount
    });
    await sale.save();


    // 6️⃣ Update coupon distributions & consumers
    coupon.currentDistributions += 1;
    coupon.consumersId.push(userId);
    await coupon.save();

    return res.status(201).json({ success: true, message: "Coupon claimed and sale record created (pending payment)", data: { userCoupon, sale } });

  } catch (error) {
    console.error("Error claiming coupon:", error);
    return res.status(500).json({ success: false, message: "Error claiming coupon", error: error.message });
  }
};



export const completeSale = async (req, res) => {
  try {
    const { saleId, totalAmount } = req.body; // totalAmount = user entered amount before discount

    if (!saleId || !totalAmount) {
      return res.status(400).json({ success: false, message: "Sale ID and total amount are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      return res.status(400).json({ success: false, message: "Invalid Sale ID" });
    }

    const sale = await Salses.findById(saleId);

    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
    if (sale.status === "completed") return res.status(400).json({ success: false, message: "Sale already completed" });

    const coupon = await Coupon.findById(sale.couponId);
    const user = await Coupon.findById(sale.userId);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    const increment = (user.usercount - usedCount) + usedCount + 1;
    await user.save();

    // Calculate discount and final amount
    const totalDiscountPercentage = sale.usedCount * coupon.discountPercentage;
    const discountAmount = (totalAmount * totalDiscountPercentage) / 100;

    // Final amount after discount
    const finalAmount = totalAmount - discountAmount;


    // Update sale
    sale.status = "completed";
    sale.discountAmount = discountAmount;
    sale.finalAmount = finalAmount;
    await sale.save();

    // Update coupon distributions
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
        usedCount: sale.usedCount,
        totalAmount,
        discountAmount,
        finalAmount
      }
    });

  } catch (error) {
    console.error("Error completing sale:", error);
    return res.status(500).json({ success: false, message: "Error completing sale", error: error.message });
  }
};


export const cancelSale = async (req, res) => {
  try {
    const userId = req.user._id;
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
