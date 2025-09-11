
import Coupon from '../models/coupunModel.js';
import User from '../models/userModel.js';
import UserCoupon from '../models/UserCoupon.js';
import { uploadToCloudinary } from '../utils/Cloudinary.js';
import mongoose from 'mongoose';
import ManualAddress from '../models/ManualAddress.js';
import Salse from '../models/Sales.js'

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


// Create a new coupon
export const create = async (req, res) => {
  try {
    const {
      title,
      manul_address,
      copuon_srno,
      category,
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

    // Validate required fields
    if (!title || !manul_address || !copuon_srno || !category || !discountPercentage || !validTill || !termsAndConditions) {
      return res.status(400).json({
        message: 'Missing required fields: title, manul_address, copuon_srno, category, discountPercentage, validTill, termsAndConditions',
      });
    }

    // Validate shope_location (GeoJSON format: [lng, lat])
    let location = null;
    if (shope_location) {
      try {
        const parsedLocation = JSON.parse(shope_location);
        if (
          parsedLocation.type !== 'Point' ||
          !Array.isArray(parsedLocation.coordinates) ||
          parsedLocation.coordinates.length !== 2 ||
          isNaN(parsedLocation.coordinates[0]) ||
          isNaN(parsedLocation.coordinates[1])
        ) {
          return res.status(400).json({ message: 'Invalid shope_location format. Must be { type: "Point", coordinates: [lng, lat] }' });
        }
        location = parsedLocation;
      } catch (error) {
        return res.status(400).json({ message: 'Invalid shope_location JSON' });
      }
    } else {
      return res.status(400).json({ message: 'shope_location is required' });
    }

    // Validate fromTime and toTime if isFullDay is false
    if (!isFullDay && (!fromTime || !toTime)) {
      return res.status(400).json({ message: 'fromTime and toTime are required when isFullDay is false' });
    }

    // Validate tag
    if (!tag || !Array.isArray(tag) || tag.length === 0) {
      return res.status(400).json({ message: 'At least one tag is required' });
    }

    // Validate discountPercentage
    if (discountPercentage < 0 || discountPercentage > 100) {
      return res.status(400).json({ message: 'discountPercentage must be between 0 and 100' });
    }

    // Validate validTill
    if (new Date(validTill) <= new Date()) {
      return res.status(400).json({ message: 'validTill must be a future date' });
    }

    // Validate category
    if (!Array.isArray(category) || category.length === 0) {
      return res.status(400).json({ message: 'At least one category is required' });
    }

    // Handle image uploads
    let copuon_image = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadPromises = req.files.map((file) =>
          uploadToCloudinary(file.buffer, 'coupons') // Upload to 'coupons' folder in Cloudinary
        );
        const uploadResults = await Promise.all(uploadPromises);
        copuon_image = uploadResults.map((result) => result.secure_url); // Store secure URLs
      } catch (error) {
        return res.status(500).json({ message: 'Error uploading images to Cloudinary', error: error.message });
      }
    }

    // Get ownerId from authenticated user
    const ownerId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(401).json({ message: 'Invalid user ID' });
    }

    // Create new coupon
    const newCoupon = new Coupon({
      title,
      manul_address,
      copuon_srno,
      category,
      discountPercentage,
      ownerId,
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

    // Save coupon
    const savedCoupon = await newCoupon.save();

    // Update user's createdCouponsId
    const currentUser = await User.findById(ownerId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    currentUser.createdCouponsId.push(savedCoupon._id);
    await currentUser.save();

    // Send response
    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      coupon: savedCoupon,
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating coupon',
      error: error.message,
    });
  }
};



// export const getAllCouponsWithStatusTag = async (req, res) => {
//   try {
//     const userId = mongoose.Types.ObjectId(req.user.id); // Logged-in user
//     const { radius = 100000, search = '', page = 1, limit = 50, manualCode, lat, lng } = req.query;
//     const skip = (page - 1) * limit;

//     let mode = 'user';
//     let baseLocation = null;
//     let effectiveRadius = Number(radius);

//     // 1️⃣ Logged-in user: Get latestLocation
//     if (req.user?.id) {
//       const user = await User.findById(req.user.id).select('latestLocation');
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
//           // Guest user: Use manual location as base
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
//       effectiveRadius = Number(radius) || 100000; // Use provided radius or default
//     }

//     // 4️⃣ Fallback: Default location (center of India)
//     if (!baseLocation) {
//       baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] };
//       mode = 'default';
//     }

//     // 5️⃣ Build search regex
//     const searchRegex = new RegExp(search, 'i');

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
//             {
//               $match: {
//                 $or: [
//                   { manul_address: searchRegex },
//                   { title: searchRegex },
//                   { tag: searchRegex },
//                 ],
//               },
//             },
//           ]
//         : []),
//       // Lookup user coupon status
//       {
//         $lookup: {
//           from: 'usercoupons',
//           let: { couponId: '$_id' },
//           pipeline: [
//             {
//               $match: {
//                 $expr: { $and: [{ $eq: ['$couponId', '$$couponId'] }, { $eq: ['$userId', userId] }] },
//               },
//             },
//             { $project: { status: 1, _id: 0 } },
//           ],
//           as: 'userStatus',
//         },
//       },
//       // Flatten userStatus array
//       { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
//       // Add displayTag based on userStatus or fallback to first tag
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
//               default: { $arrayElemAt: ['$tag', 0] },
//             },
//           },
//         },
//       },
//       // Project necessary fields
//       {
//         $project: {
//           title: 1,
//           copuon_image: 1,
//           manul_address: 1,
//           copuon_srno: 1,
//           discountPercentage: 1,
//           validTill: 1,
//           displayTag: 1,
//           distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
//         },
//       },
//       // Sort by distance and validTill
//       { $sort: { distance: 1, validTill: -1 } },
//       // Pagination
//       { $skip: parseInt(skip) },
//       { $limit: parseInt(limit) },
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
//             {
//               $match: {
//                 $or: [
//                   { manul_address: searchRegex },
//                   { title: searchRegex },
//                   { tag: searchRegex },
//                 ],
//               },
//             },
//           ]
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
//       page: parseInt(page),
//       limit: parseInt(limit),
//       total,
//       pages: Math.ceil(total / limit),
//     });
//   } catch (error) {
//     console.error('Error fetching coupons:', error);
//     res.status(500).json({ success: false, message: 'Server error', error: error.message });
//   }
// };




export const getAllCouponsWithStatusTag = async (req, res) => {
  try {
    // Determine user ID (null for guests)
    let userId = null;
    if (req.user?.id && mongoose.isValidObjectId(req.user.id)) {
      userId = mongoose.Types.ObjectId(req.user.id);
    }

    // Validate query parameters
    const { radius = 100000, search = '', page = 1, limit = 50, manualCode, lat, lng } = req.query;
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

    const skip = (parsedPage - 1) * parsedLimit;

    let mode = userId ? 'user' : 'guest';
    let baseLocation = null;
    let effectiveRadius = parsedRadius;

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
          // Guest or no user location: Use manual location as base
          baseLocation = manualLocation.location;
          mode = 'manual';
          effectiveRadius = null; // No radius limit for manual location
        } else {
          // Logged-in user: Check distance from manual location
          const check = await ManualAddress.aggregate([
            {
              $geoNear: {
                near: baseLocation,
                distanceField: 'distance',
                spherical: true,
                query: { uniqueCode: manualCode },
                limit: 1,
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

    // 4️⃣ Fallback: Default location (center of India)
    if (!baseLocation) {
      baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] };
      mode = 'default';
    }

    // 5️⃣ Build search regex (sanitize input)
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    // 6️⃣ Build aggregation pipeline
    const dataPipeline = [
      // Match active coupons and validTill in the future or null
      {
        $match: {
          active: true,
          $or: [
            { validTill: { $gt: new Date() } },
            { validTill: null },
          ],
        },
      },
      // GeoNear for location-based filtering
      {
        $geoNear: {
          near: baseLocation,
          distanceField: 'distance',
          ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
          spherical: true,
          key: 'shope_location',
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
                { tag: searchRegex },
              ],
            },
          },
        ]
        : []),
      // Lookup user coupon status (skip for guests)
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
                    ...(userId ? [{ $eq: ['$userId', userId] }] : []),
                  ],
                },
              },
            },
            { $project: { status: 1, _id: 0 } },
          ],
          as: 'userStatus',
        },
      },
      // Flatten userStatus array
      { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
      // Add displayTag based on userStatus or fallback to 'Not Claimed'
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
      // Sort by distance and validTill
      { $sort: { distance: 1, validTill: -1 } },
      // Pagination
      { $skip: skip },
      { $limit: parsedLimit },
    ];

    const coupons = await Coupon.aggregate(dataPipeline);

    // 7️⃣ Count total for pagination
    const countPipeline = [
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
        $geoNear: {
          near: baseLocation,
          distanceField: 'distance',
          ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
          spherical: true,
          key: 'shope_location',
        },
      },
      ...(search.trim()
        ? [
          {
            $match: {
              $or: [
                { manual_address: searchRegex },
                { title: searchRegex },
                { tag: searchRegex },
              ],
            },
          },
        ]
        : []),
      { $count: 'total' },
    ];

    const totalResult = await Coupon.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    // 8️⃣ Send response
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
      senderUserCoupon.status = 'transferred';
      senderUserCoupon.transferredTo = receiverId;
      senderUserCoupon.transferDate = new Date();
      await senderUserCoupon.save();
    }

    // Create new UserCoupon for receiver
    const newUserCoupon = new UserCoupon({
      couponId,
      userId: receiverId,
      status: 'available',
      senders: [{ senderId, sentAt: new Date() }],
      qrCode,
      count: count + 1,
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
    const { couponId, useCount = 1 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(400).json({ success: false, message: "Invalid Coupon ID" });
    }

    const coupon = await Coupon.findById(couponId);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    if (new Date() > coupon.validTill) return res.status(400).json({ success: false, message: "Coupon expired" });

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
        const sale = new Sales({
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

    const sale = new Sales({
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

    const sale = await Sales.findById(saleId);

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

    const sale = await Sales.findById(saleId);
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


const getbyid = async (req, res) => {
  try {
    const user = req.user.id;
    const { couponId } = req.params;

    // Find the coupon by ID
    const coupon = await UserCoupon.findOne({
      couponId,
      userId: user._id,
      status: 'claim'
    });
    if (coupon) {
      res
    }


    res.status(200).json(coupon);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching coupon',
      error: error.message
    });
  }
}

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
  getbyid,
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
