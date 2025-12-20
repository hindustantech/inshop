import Banner from "../models/Banner.js";
import User from "../models/userModel.js";
// Create Banner (default expiry = 15 days, unless specified)
import { uploadToCloudinary } from "../utils/Cloudinary.js";
import { exportToCSV } from "../utils/exportcsv.js";
import Category from "../models/CategoryCopun.js";
import mongoose from "mongoose";
import ManualAddress from "../models/ManualAddress.js";
import logger from "../utils/logger.js";

// export const createBanner = async (req, res) => {
//     try {
//         const userId = req.user?.id;
//         const userType = req.user?.type; // 'partner' | 'agency'

//         let {
//             google_location_url,
//             banner_type,
//             lat,
//             lng,
//             title,
//             main_keyword,
//             keyword,
//             search_radius,
//             manual_address,
//             expiryDays // number of days to expire
//         } = req.body;

//         // Validate user
//         if (!["partner", "agency"].includes(userType)) {
//             return res.status(401).json({ success: false, message: "Unauthorized Access Denied" });
//         }

//         // Validate coordinates
//         if (!lat || !lng) {
//             return res.status(400).json({ success: false, message: "Latitude and Longitude are required" });
//         }

//         // Handle image upload
//         let banner_image = null;
//         if (req.file) {
//             const uploadResult = await uploadToCloudinary(req.file.buffer, "banners");
//             banner_image = uploadResult.secure_url;
//         } else {
//             return res.status(400).json({ success: false, message: "Banner image is required" });
//         }

//         // Convert keywords into arrays
//         if (typeof main_keyword === "string") main_keyword = main_keyword.split(",").map(k => k.trim());
//         if (typeof keyword === "string") keyword = keyword.split(",").map(k => k.trim());

//         // Set expiryAt
//         let expiryAt = null;
//         if (expiryDays && !isNaN(expiryDays)) {
//             expiryAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
//         }

//         // Create banner
//         const banner = new Banner({
//             createdBy: { id: userId, type: userType },
//             banner_image,
//             google_location_url,
//             banner_type,
//             manual_address,
//             search_radius: search_radius || 100000,
//             location: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
//             title,
//             main_keyword: Array.isArray(main_keyword) ? main_keyword : [],
//             keyword: Array.isArray(keyword) ? keyword : [],
//             expiryAt,
//         });

//         await banner.save();

//         res.status(201).json({ success: true, message: "Banner created successfully", data: banner });

//     } catch (error) {
//         console.error("CreateBanner Error:", error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };


export const createBanner = async (req, res) => {
  try {
    const userId = req.user?._id;
    const userType = req.user?.type; // partner | agency | super_admin

    let {
      google_location_url,
      banner_type,
      lat,
      lng,
      title,
      main_keyword,
      address_notes,
      keyword,
      website_url,
      search_radius,
      manual_address,
      expiryDays, // number of days
      category,   // array of category IDs
      ownerId,    // only agency/super_admin can pass this
    } = req.body;

    /* ======================
       🔹 Role Validation
    ====================== */
    if (!['partner', 'agency', 'super_admin'].includes(userType)) {
      return res.status(401).json({ success: false, message: 'Unauthorized Access' });
    }

    /* ======================
       🔹 Required Fields Validation
    ====================== */
    if (!title || !manual_address || !banner_type || !lat || !lng || !address_notes) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, manual_address, banner_type, lat, lng',
      });
    }

    // Ensure category is provided and is an array
    if (!category || !Array.isArray(category) || category.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one category is required',
      });
    }

    /* ======================
       🔹 Category Validation
    ====================== */
    for (const catId of category) {
      if (!mongoose.Types.ObjectId.isValid(catId)) {
        return res.status(400).json({ success: false, message: `Invalid category ID: ${catId}` });
      }
      const categoryExists = await Category.findById(catId);
      if (!categoryExists) {
        return res.status(404).json({ success: false, message: `Category not found: ${catId}` });
      }
    }

    /* ======================
       🔹 Banner Type Validation
    ====================== */
    if (!['Changeable', 'Unchangeable'].includes(banner_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner_type. Must be "Changeable" or "Unchangeable"',
      });
    }

    /* ======================
       🔹 URL Validation
    ====================== */
    // const urlRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/;
    // if (google_location_url && !urlRegex.test(google_location_url)) {
    //   return res.status(400).json({ success: false, message: 'Invalid Google Location URL format' });
    // }
    // if (website_url && !urlRegex.test(website_url)) {
    //   return res.status(400).json({ success: false, message: 'Invalid Website URL format' });
    // }

    /* ======================
       🔹 Image Validation
    ====================== */
    let banner_image = null;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Banner image is required' });
    }
    try {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'banners');
      banner_image = uploadResult.secure_url;
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error uploading image', error: err.message });
    }

    /* ======================
       🔹 Keywords Formatting
    ====================== */
    if (typeof main_keyword === 'string') {
      main_keyword = main_keyword.split(',').map((k) => k.trim()).filter((k) => k);
    } else {
      main_keyword = Array.isArray(main_keyword) ? main_keyword : [];
    }

    if (typeof keyword === 'string') {
      keyword = keyword.split(',').map((k) => k.trim()).filter((k) => k);
    } else {
      keyword = Array.isArray(keyword) ? keyword : [];
    }

    /* ======================
       🔹 Expiry Calculation
    ====================== */
    let expiryAt = null;
    if (expiryDays && !isNaN(expiryDays) && expiryDays >= 0) {
      expiryAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    }

    /* ======================
       🔹 Handle createdBy & ownerId
    ====================== */
    let finalCreatedBy = userId;
    let finalOwnerId = userId;

    if (userType === 'partner') {
      finalCreatedBy = userId;
      finalOwnerId = userId;
    } else if (['agency', 'super_admin'].includes(userType)) {
      finalCreatedBy = userId;
      if (ownerId) {
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
          return res.status(400).json({ success: false, message: 'Invalid ownerId' });
        }
        const ownerExists = await User.findById(ownerId);
        if (!ownerExists) {
          return res.status(404).json({ success: false, message: 'Owner user not found' });
        }
        finalOwnerId = ownerId;
      } else {
        finalOwnerId = userId;
      }
    }

    /* ======================
       🔹 Coordinate Validation
    ====================== */
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ success: false, message: 'Invalid latitude or longitude' });
    }

    /* ======================
       🔹 Create Banner
    ====================== */
    const banner = new Banner({
      createdby: finalCreatedBy,
      ownerId: finalOwnerId,
      banner_image,
      address_notes,
      website_url,
      google_location_url,
      banner_type,
      manual_address,
      search_radius: search_radius ? parseFloat(search_radius) : 100000,
      location: {
        type: 'Point',
        coordinates: [parsedLng, parsedLat],
      },
      title,
      main_keyword,
      keyword,
      expiryAt,
      category, // Array of category IDs
    });

    await banner.save();

    return res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner,
    });
  } catch (error) {
    console.error('CreateBanner Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createBanneradmin = async (req, res) => {
  try {
    const userId = req.user?._id;
    const userType = req.user?.type; // partner | agency | super_admin

    let {
      google_location_url,
      banner_type,
      lat,
      lng,
      title,
      main_keyword,
      keyword,
      address_notes,
      website_url,
      search_radius,
      manual_address,
      expiryDays, // number of days
      category,   // array of category IDs
      ownerId,    // only agency/super_admin can pass this
    } = req.body;

    /* ======================
       🔹 Role Validation
    ====================== */

    if (!['partner', 'agency','admin', 'super_admin'].includes(userType)) {
      return res.status(401).json({ success: false, message: 'Unauthorized Access' });
    }

    /* ======================
       🔹 Required Fields Validation
    ====================== */
    if (!title || !manual_address || !banner_type || !lat || !lng || !address_notes) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, manual_address, banner_type, lat, lng',
      });
    }

    // Ensure category is provided and is an array
    if (!category || !Array.isArray(category) || category.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one category is required',
      });
    }

    /* ======================
       🔹 Category Validation
    ====================== */
    for (const catId of category) {
      if (!mongoose.Types.ObjectId.isValid(catId)) {
        return res.status(400).json({ success: false, message: `Invalid category ID: ${catId}` });
      }
      const categoryExists = await Category.findById(catId);
      if (!categoryExists) {
        return res.status(404).json({ success: false, message: `Category not found: ${catId}` });
      }
    }

    /* ======================
       🔹 Banner Type Validation
    ====================== */
    if (!['Changeable', 'Unchangeable'].includes(banner_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner_type. Must be "Changeable" or "Unchangeable"',
      });
    }

    /* ======================
       🔹 URL Validation
    ====================== */
    // const urlRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/;
    // if (google_location_url && !urlRegex.test(google_location_url)) {
    //   return res.status(400).json({ success: false, message: 'Invalid Google Location URL format' });
    // }
    // if (website_url && !urlRegex.test(website_url)) {
    //   return res.status(400).json({ success: false, message: 'Invalid Website URL format' });
    // }

    /* ======================
       🔹 Image Validation
    ====================== */
    let banner_image = null;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Banner image is required' });
    }
    try {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'banners');
      banner_image = uploadResult.secure_url;
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error uploading image', error: err.message });
    }

    /* ======================
       🔹 Keywords Formatting
    ====================== */
    if (typeof main_keyword === 'string') {
      main_keyword = main_keyword.split(',').map((k) => k.trim()).filter((k) => k);
    } else {
      main_keyword = Array.isArray(main_keyword) ? main_keyword : [];
    }

    if (typeof keyword === 'string') {
      keyword = keyword.split(',').map((k) => k.trim()).filter((k) => k);
    } else {
      keyword = Array.isArray(keyword) ? keyword : [];
    }

    /* ======================
       🔹 Expiry Calculation
    ====================== */
    let expiryAt = null;
    if (expiryDays && !isNaN(expiryDays) && expiryDays >= 0) {
      expiryAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    }

    /* ======================
       🔹 Handle createdBy & ownerId
    ====================== */
    let finalCreatedBy = userId;
    let finalOwnerId = userId;

    if (userType === 'partner') {
      finalCreatedBy = userId;
      finalOwnerId = userId;
    } else if (['agency', 'super_admin'].includes(userType)) {
      finalCreatedBy = userId;
      if (ownerId) {
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
          return res.status(400).json({ success: false, message: 'Invalid ownerId' });
        }
        const ownerExists = await User.findById(ownerId);
        if (!ownerExists) {
          return res.status(404).json({ success: false, message: 'Owner user not found' });
        }
        finalOwnerId = ownerId;
      } else {
        finalOwnerId = userId;
      }
    }

    /* ======================
       🔹 Coordinate Validation
    ====================== */
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ success: false, message: 'Invalid latitude or longitude' });
    }

    /* ======================
       🔹 Create Banner
    ====================== */
    const banner = new Banner({
      createdby: finalCreatedBy,
      ownerId: finalOwnerId,
      banner_image,
      website_url,
      address_notes,
      google_location_url,
      banner_type,
      manual_address,
      search_radius: search_radius ? parseFloat(search_radius) : 100000,
      location: {
        type: 'Point',
        coordinates: [parsedLng, parsedLat],
      },
      title,
      main_keyword,
      keyword,
      expiryAt,
      category, // Array of category IDs
    });

    await banner.save();

    return res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner,
    });
  } catch (error) {
    console.error('CreateBanner Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/*  */



export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;


    // Check if the banner exists
    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    // Delete the banner
    await Banner.findByIdAndDelete(id);

    res.status(200).json({ message: 'Banner deleted successfully' });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


// export const getUserNearestBanners = async (req, res) => {
//   try {
//     const {
//       radius = 100000,
//       search = '',
//       page = 1,
//       limit = 50,
//       manualCode,
//       lat,
//       lng,
//       category, // Can be a single ID or array of IDs (e.g., category[]=id1&category[]=id2)
//     } = req.query;

//     const skip = (page - 1) * limit;

//     let mode = 'user';
//     let baseLocation = null;
//     let effectiveRadius = Number(radius);

//     // 1️⃣ Logged-in user
//     if (req.user?.id) {
//       const user = await User.findById(req.user.id).select('latestLocation');
//       if (user?.latestLocation?.coordinates) {
//         const [userLng, userLat] = user.latestLocation.coordinates;
//         baseLocation = { type: 'Point', coordinates: [userLng, userLat] };
//         console.log(`User location: ${JSON.stringify(baseLocation)}`);
//       }
//     }

//     // 2️⃣ Manual location
//     let manualLocation = null;
//     if (manualCode) {
//       manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode }).select('city state location');
//       if (manualLocation?.location?.coordinates) {
//         if (!baseLocation) {
//           // Guest user → use manual location as base
//           baseLocation = manualLocation.location;
//           mode = 'manual';
//           effectiveRadius = null; // No radius limit
//           console.log(`Manual location: ${JSON.stringify(baseLocation)}`);
//         } else {
//           // Logged-in user → check distance from manual location
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
//             effectiveRadius = null;
//             console.log(`Switched to manual location: ${JSON.stringify(baseLocation)}`);
//           }
//         }
//       } else {
//         console.log(`Manual location not found for code: ${manualCode}`);
//       }
//     }

//     // 3️⃣ Custom location from query params (lat, lng)
//     if (lat && lng) {
//       const parsedLat = Number(lat);
//       const parsedLng = Number(lng);
//       if (isNaN(parsedLat) || isNaN(parsedLng)) {
//         return res.status(400).json({
//           success: false,
//           message: 'Invalid latitude or longitude',
//         });
//       }
//       baseLocation = { type: 'Point', coordinates: [parsedLng, parsedLat] };
//       mode = 'custom';
//       effectiveRadius = Number(radius) || 100000;
//       console.log(`Custom location: ${JSON.stringify(baseLocation)}, radius: ${effectiveRadius}`);
//     }

//     // 4️⃣ Fallback for guest with no manualCode or custom location
//     if (!baseLocation) {
//       baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] }; // Center of India
//       mode = 'default';
//       effectiveRadius = null; // Remove radius limit for default mode
//       console.log(`Default location: ${JSON.stringify(baseLocation)}`);
//     }

//     // 5️⃣ Build expiry query
//     const expiryQuery = { $or: [{ expiryAt: { $gt: new Date() } }, { expiryAt: null }] };

//     // 6️⃣ Build category filter
//     let categoryFilter = {};
//     if (category) {
//       // Handle category as array or single ID
//       const categoryIds = Array.isArray(category) ? category : [category];
//       const validCategoryIds = [];
//       for (const catId of categoryIds) {
//         if (mongoose.Types.ObjectId.isValid(catId)) {
//           validCategoryIds.push(new mongoose.Types.ObjectId(catId));
//         } else {
//           console.log(`Invalid category ID: ${catId}`);
//           return res.status(400).json({
//             success: false,
//             message: `Invalid category ID: ${catId}`,
//           });
//         }
//       }
//       if (validCategoryIds.length > 0) {
//         categoryFilter = { category: { $in: validCategoryIds } };
//         console.log(`Category filter applied: ${validCategoryIds.join(', ')}`);
//       } else {
//         return res.status(400).json({
//           success: false,
//           message: 'No valid category IDs provided',
//         });
//       }
//     }

//     // 7️⃣ Combine all filters
//     const mainQuery = {
//       $and: [
//         expiryQuery,
//         categoryFilter,
//       ].filter((condition) => Object.keys(condition).length > 0),
//     };

//     // 8️⃣ Build aggregation pipeline
//     const dataPipeline = [
//       {
//         $geoNear: {
//           near: baseLocation,
//           distanceField: 'distance',
//           ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
//           spherical: true,
//           query: mainQuery,
//         },
//       },
//     ];

//     if (mode === 'manual' && manualLocation?.city) {
//       dataPipeline.push({ $match: { manual_address: manualLocation.city } });
//       console.log(`Filtering by manual city: ${manualLocation.city}`);
//     }

//     if (search.trim()) {
//       dataPipeline.push({
//         $match: {
//           $or: [
//             { title: { $regex: search, $options: 'i' } },
//             { keyword: { $regex: search, $options: 'i' } },
//             { main_keyword: { $regex: search, $options: 'i' } },
//           ],
//         },
//       });
//       console.log(`Search filter applied: ${search}`);
//     }

//     dataPipeline.push(
//       { $sort: { distance: 1 } },
//       { $skip: skip },
//       { $limit: Number(limit) },
//       {
//         $project: {
//           banner_image: 1,
//           title: 1,
//           website_url: 1,
//           google_location_url: 1,
//           keyword: 1,
//           manual_address: 1,
//           location: 1,
//           address_notes: 1,
//           category: 1,
//           distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
//         },
//       },
//     );

//     let data = await Banner.aggregate(dataPipeline);
//     console.log(`Initial query returned ${data.length} banners`);

//     // 9️⃣ Fallback: If no data, fetch all non-expired banners
//     if (data.length === 0) {
//       console.log('No banners found with initial query, falling back to all non-expired banners');
//       const fallbackPipeline = [
//         { $match: expiryQuery },
//         ...(categoryFilter.category
//           ? [{ $match: { category: { $in: validCategoryIds } } }]
//           : []),
//         ...(search.trim()
//           ? [
//             {
//               $match: {
//                 $or: [
//                   { title: { $regex: search, $options: 'i' } },
//                   { keyword: { $regex: search, $options: 'i' } },
//                   { main_keyword: { $regex: search, $options: 'i' } },
//                 ],
//               },
//             },
//           ]
//           : []),
//         { $sort: { createdAt: -1 } }, // Sort by newest first
//         { $skip: skip },
//         { $limit: Number(limit) },
//         {
//           $project: {
//             banner_image: 1,
//             title: 1,
//             website_url: 1,
//             google_location_url: 1,
//             keyword: 1,
//             manual_address: 1,
//             address_notes: 1,
//             location: 1,
//             category: 1,
//             distanceInKm: { $literal: 0 }, // No distance for fallback
//           },
//         },
//       ];
//       data = await Banner.aggregate(fallbackPipeline);
//       mode = 'fallback';
//       console.log(`Fallback query returned ${data.length} banners`);
//     }

//     // 🔟 Count total with same filters
//     const countPipeline = [
//       {
//         $geoNear: {
//           near: baseLocation,
//           distanceField: 'distance',
//           ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
//           spherical: true,
//           query: mainQuery,
//         },
//       },
//     ];

//     if (mode === 'manual' && manualLocation?.city) {
//       countPipeline.push({ $match: { manual_address: manualLocation.city } });
//     }

//     if (search.trim()) {
//       countPipeline.push({
//         $match: {
//           $or: [
//             { title: { $regex: search, $options: 'i' } },
//             { keyword: { $regex: search, $options: 'i' } },
//             { main_keyword: { $regex: search, $options: 'i' } },
//           ],
//         },
//       });
//     }

//     countPipeline.push({ $count: 'total' });
//     let total = (await Banner.aggregate(countPipeline))[0]?.total || 0;

//     // Adjust total for fallback mode
//     if (data.length > 0 && mode === 'fallback') {
//       const fallbackCountPipeline = [
//         { $match: expiryQuery },
//         ...(categoryFilter.category
//           ? [{ $match: { category: { $in: validCategoryIds } } }]
//           : []),
//         ...(search.trim()
//           ? [
//             {
//               $match: {
//                 $or: [
//                   { title: { $regex: search, $options: 'i' } },
//                   { keyword: { $regex: search, $options: 'i' } },
//                   { main_keyword: { $regex: search, $options: 'i' } },
//                 ],
//               },
//             },
//           ]
//           : []),
//         { $count: 'total' },
//       ];
//       total = (await Banner.aggregate(fallbackCountPipeline))[0]?.total || 0;
//     }

//     // 🔟 Send response
//     res.json({
//       success: true,
//       mode,
//       total,
//       page: Number(page),
//       pages: Math.ceil(total / limit),
//       data,
//       filters: {
//         category: category || null, // Return the array of category IDs
//         search: search || null,
//         radius: effectiveRadius || null,
//       },
//     });
//   } catch (err) {
//     console.error('Error fetching nearest banners:', err);
//     res.status(500).json({ success: false, message: 'Error fetching nearest banners', error: err.message });
//   }
// };




export const getUserNearestBanners = async (req, res) => {
  try {
    const {
      radius = 100000,
      search = "",
      page = 1,
      limit = 50,
      manualCode,
      lat,
      lng,
      category,
    } = req.query;

    logger.info("=== BANNER SEARCH STARTED ===", {
      queryParams: { radius, search, page, limit, manualCode, lat, lng, category },
      user: req.user?.id || 'no-user'
    });

    const skip = (page - 1) * limit;
    let mode = "user";
    let baseLocation = null;
    let effectiveRadius = Number(radius);

    /* ============================
       STEP 1: FIND BASE LOCATION
    ============================ */

    logger.debug("STEP 1: Finding base location");

    // 1️⃣ Logged in user location
    if (req.user?.id) {
      logger.debug("Checking user location", { userId: req.user.id });
      const user = await User.findById(req.user.id).select("latestLocation");
      if (user?.latestLocation?.coordinates) {
        const [lng, lat] = user.latestLocation.coordinates;
        baseLocation = { type: "Point", coordinates: [lng, lat] };
        logger.debug("User location found", { baseLocation });
      } else {
        logger.debug("No user location found");
      }
    }

    // 2️⃣ Manual Code location
    let manualLocation = null;
    if (manualCode) {
      logger.debug("Checking manual code location", { manualCode });
      manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode });

      if (manualLocation?.location?.coordinates) {
        if (!baseLocation) {
          baseLocation = manualLocation.location;
          effectiveRadius = null;
          mode = "manual";
          logger.debug("Manual location found and set", { baseLocation, mode });
        }
      } else {
        logger.debug("Manual location not found for code", { manualCode });
      }
    }

    // 3️⃣ Custom lat/lng
    if (lat && lng) {
      logger.debug("Using custom lat/lng", { lat, lng });
      const Lat = Number(lat);
      const Lng = Number(lng);
      baseLocation = { type: "Point", coordinates: [Lng, Lat] };
      effectiveRadius = Number(radius);
      mode = "custom";
      logger.debug("Custom location set", { baseLocation, mode });
    }

    // 4️⃣ No location at all → default India center
    if (!baseLocation) {
      baseLocation = { type: "Point", coordinates: [78.9629, 20.5937] };
      effectiveRadius = null;
      mode = "default";
      logger.debug("Using default location", { baseLocation, mode });
    }

    logger.info("Base location determined", { mode, baseLocation, effectiveRadius });

    /* ============================
       STEP 2: SEARCH FILTER (FIXED)
    ============================ */

    let searchFilter = {};
    if (search.trim()) {
      const s = search.trim();
      const searchRegex = new RegExp(s, "i");

      searchFilter = {
        $or: [
          { title: searchRegex },
          { keyword: searchRegex },
          { main_keyword: searchRegex },
          { manual_address: searchRegex }
        ],
      };

      logger.debug("Search filter created", {
        searchTerm: s,
        searchFilter: JSON.stringify(searchFilter),
        regexPattern: searchRegex.toString()
      });
    } else {
      logger.debug("No search term provided");
    }

    /* ============================
       STEP 3: CATEGORY FILTER
    ============================ */
    let categoryFilter = {};
    let validCategoryIds = [];

    if (category) {
      const array = Array.isArray(category) ? category : [category];
      logger.debug("Processing categories", { inputCategories: array });

      for (const c of array) {
        if (!mongoose.Types.ObjectId.isValid(c)) {
          logger.error("Invalid category ID", { category: c });
          return res.status(400).json({ success: false, message: `Invalid category: ${c}` });
        }
        validCategoryIds.push(new mongoose.Types.ObjectId(c));
      }

      categoryFilter = { category: { $in: validCategoryIds } };
      logger.debug("Category filter created", {
        validCategoryIds: validCategoryIds.map(id => id.toString()),
        categoryFilter: JSON.stringify(categoryFilter)
      });
    } else {
      logger.debug("No category filter provided");
    }

    /* ============================
       STEP 4: EXPIRY FILTER
    ============================ */
    const expiryQuery = {
      $or: [{ expiryAt: { $gt: new Date() } }, { expiryAt: null }],
    };

    logger.debug("Expiry query", { expiryQuery: JSON.stringify(expiryQuery), currentTime: new Date() });

    /* ============================
       STEP 5: COMBINE ALL FILTERS
    ============================ */
    const mainQuery = {
      $and: [
        expiryQuery,
        categoryFilter,
        searchFilter,
      ].filter((x) => Object.keys(x).length > 0),
    };

    logger.info("Main query constructed", {
      mainQuery: JSON.stringify(mainQuery),
      hasExpiry: Object.keys(expiryQuery).length > 0,
      hasCategory: Object.keys(categoryFilter).length > 0,
      hasSearch: Object.keys(searchFilter).length > 0
    });

    /* ============================
       STEP 6: MAIN QUERY PIPELINE
    ============================ */

    const dataPipeline = [
      {
        $geoNear: {
          near: baseLocation,
          distanceField: "distance",
          spherical: true,
          ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
          query: mainQuery,
        },
      },
      { $sort: { distance: 1 } },
      { $skip: skip },
      { $limit: Number(limit) },
      {
        $project: {
          banner_image: 1,
          title: 1,
          website_url: 1,
          google_location_url: 1,
          keyword: 1,
          main_keyword: 1,
          manual_address: 1,
          address_notes: 1,
          location: 1,
          category: 1,
          distanceInKm: { $round: [{ $divide: ["$distance", 1000] }, 2] },
        },
      },
    ];

    logger.debug("Main data pipeline", {
      pipeline: JSON.stringify(dataPipeline),
      skip,
      limit: Number(limit)
    });

    let data = await Banner.aggregate(dataPipeline);
    logger.info("Main query results", {
      dataCount: data.length,
      mode: "primary",
      sampleData: data.length > 0 ? {
        firstBanner: {
          title: data[0].title,
          keywords: data[0].keyword,
          mainKeywords: data[0].main_keyword,
          distance: data[0].distanceInKm
        }
      } : 'no-data'
    });

    /* ============================
       STEP 7: FALLBACK IF NO BANNERS
    ============================ */

    if (data.length === 0) {
      logger.warn("No results from main query, using fallback");

      const fallbackPipeline = [
        { $match: expiryQuery },
        ...(validCategoryIds.length
          ? [{ $match: { category: { $in: validCategoryIds } } }]
          : []),
        ...(search.trim() ? [{ $match: searchFilter }] : []),
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $project: {
            banner_image: 1,
            title: 1,
            website_url: 1,
            google_location_url: 1,
            keyword: 1,
            main_keyword: 1,
            manual_address: 1,
            address_notes: 1,
            location: 1,
            category: 1,
            distanceInKm: { $literal: 0 },
          },
        },
      ];

      logger.debug("Fallback pipeline", { pipeline: JSON.stringify(fallbackPipeline) });

      data = await Banner.aggregate(fallbackPipeline);
      mode = "fallback";

      logger.info("Fallback query results", {
        dataCount: data.length,
        mode: "fallback",
        sampleData: data.length > 0 ? {
          firstBanner: {
            title: data[0].title,
            keywords: data[0].keyword,
            mainKeywords: data[0].main_keyword
          }
        } : 'no-data'
      });
    }

    /* ============================
       STEP 8: COUNT TOTAL
    ============================ */

    let total = 0;

    if (mode !== "fallback") {
      logger.debug("Counting total for primary query");
      const countPipeline = [
        {
          $geoNear: {
            near: baseLocation,
            distanceField: "distance",
            spherical: true,
            ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
            query: mainQuery,
          },
        },
        { $count: "total" },
      ];

      const countResult = await Banner.aggregate(countPipeline);
      total = countResult[0]?.total || 0;
      logger.debug("Primary count result", { countResult, total });
    } else {
      logger.debug("Counting total for fallback query");
      const fallbackCountPipeline = [
        { $match: expiryQuery },
        ...(validCategoryIds.length
          ? [{ $match: { category: { $in: validCategoryIds } } }]
          : []),
        ...(search.trim() ? [{ $match: searchFilter }] : []),
        { $count: "total" },
      ];

      const countResult = await Banner.aggregate(fallbackCountPipeline);
      total = countResult[0]?.total || 0;
      logger.debug("Fallback count result", { countResult, total });
    }

    /* ============================
       STEP 9: SEND RESPONSE
    ============================ */

    const response = {
      success: true,
      mode,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data,
      filters: {
        search,
        category: category || null,
        radius: effectiveRadius || null,
      },
    };

    logger.info("=== BANNER SEARCH COMPLETED ===", {
      mode,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      dataCount: data.length,
      searchUsed: search.trim(),
      searchWorking: data.some(banner =>
        banner.title?.toLowerCase().includes(search.toLowerCase()) ||
        banner.keyword?.some(kw => kw.toLowerCase().includes(search.toLowerCase())) ||
        banner.main_keyword?.some(kw => kw.toLowerCase().includes(search.toLowerCase())) ||
        banner.manual_address?.toLowerCase().includes(search.toLowerCase())
      )
    });

    return res.json(response);

  } catch (err) {
    logger.error("Error fetching nearest banners:", {
      error: err.message,
      stack: err.stack,
      queryParams: req.query,
      user: req.user?.id || 'no-user'
    });

    res.status(500).json({
      success: false,
      message: "Error fetching nearest banners",
      error: err.message,
    });
  }
};




export const debugSearch = async (req, res) => {
  try {
    const { search = "" } = req.query;

    if (!search.trim()) {
      return res.status(400).json({ success: false, message: "Search term required" });
    }

    const searchRegex = new RegExp(search.trim(), "i");

    // Test individual search fields
    const titleResults = await Banner.find({ title: searchRegex }).limit(5);
    const keywordResults = await Banner.find({ keyword: searchRegex }).limit(5);
    const mainKeywordResults = await Banner.find({ main_keyword: searchRegex }).limit(5);
    const addressResults = await Banner.find({ manual_address: searchRegex }).limit(5);

    // Test combined search
    const combinedResults = await Banner.find({
      $or: [
        { title: searchRegex },
        { keyword: searchRegex },
        { main_keyword: searchRegex },
        { manual_address: searchRegex }
      ]
    }).limit(10);

    logger.info("DEBUG SEARCH RESULTS", {
      searchTerm: search,
      titleCount: titleResults.length,
      keywordCount: keywordResults.length,
      mainKeywordCount: mainKeywordResults.length,
      addressCount: addressResults.length,
      combinedCount: combinedResults.length,
      sampleKeywords: keywordResults.length > 0 ? keywordResults[0].keyword : 'none',
      sampleMainKeywords: mainKeywordResults.length > 0 ? mainKeywordResults[0].main_keyword : 'none'
    });

    res.json({
      success: true,
      searchTerm: search,
      results: {
        byTitle: titleResults.map(b => ({ title: b.title, keywords: b.keyword })),
        byKeyword: keywordResults.map(b => ({ title: b.title, keywords: b.keyword })),
        byMainKeyword: mainKeywordResults.map(b => ({ title: b.title, main_keywords: b.main_keyword })),
        byAddress: addressResults.map(b => ({ title: b.title, address: b.manual_address })),
        combined: combinedResults.map(b => ({
          title: b.title,
          keywords: b.keyword,
          main_keywords: b.main_keyword,
          address: b.manual_address
        }))
      },
      counts: {
        title: titleResults.length,
        keyword: keywordResults.length,
        mainKeyword: mainKeywordResults.length,
        address: addressResults.length,
        combined: combinedResults.length
      }
    });

  } catch (err) {
    logger.error("Debug search error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update expiry date (Admin only)
export const updateBannerExpiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiryInDays } = req.body;

    if (!expiryInDays) {
      return res.status(400).json({
        success: false,
        message: "expiryInDays is required",
      });
    }

    const newExpiry = new Date(Date.now() + expiryInDays * 24 * 60 * 60 * 1000);

    const banner = await Banner.findByIdAndUpdate(
      id,
      { expiryAt: newExpiry },
      { new: true }
    );

    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    res.status(200).json({
      success: true,
      message: `Expiry updated to ${expiryInDays} days`,
      data: banner,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



// export const getBannerById = async (req, res) => {
//   try {
//     const { bannerId } = req.params;

//     if (!bannerId) {
//       return res.status(400).json({
//         success: false,
//         message: "Banner ID is required",
//       });
//     }

//     const banner = await Banner.findById(bannerId)
//       .populate({
//         path: "ownerId",
//         select: "name email phone" // 👈 phone here
//       })
//       .populate({
//         path: "createdby",
//         select: "name email phone" // 👈 phone here also
//       })
//       .populate({
//         path: "promotion",
//         select: "title description ad_image"
//       })
//       .populate({
//         path: "category",
//         select: "name icon"
//       })
//       .lean();

//     if (!banner) {
//       return res.status(404).json({
//         success: false,
//         message: "Banner not found",
//       });
//     }

//     res.json({
//       success: true,
//       data: banner,
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching banner details",
//       error: error.message,
//     });
//   }
// };


export const getBannerById = async (req, res) => {
  try {
    const { bannerId } = req.params;
    const userId = req.user._id; // assuming you have authentication middleware

    if (!bannerId) {
      return res.status(400).json({ success: false, message: "Banner ID is required" });
    }

    // Fetch the user location
    const user = await User.findById(userId).lean();
    if (!user || !user.latestLocation || !user.latestLocation.coordinates) {
      return res.status(400).json({ success: false, message: "User location not available" });
    }

    const banner = await Banner.findById(bannerId)
      .populate({ path: "ownerId", select: "name email phone" })
      .populate({ path: "createdby", select: "name email phone" })
      // .populate({ path: "promotion", select: "title description ad_image" })
      // .populate({ path: "category", select: "name " })
      .lean();

    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    // Calculate distance using MongoDB $geoNear aggregation
    const userLng = user.latestLocation.coordinates[0];
    const userLat = user.latestLocation.coordinates[1];

    const distanceInMeters = calculateDistance(
      userLat,
      userLng,
      banner.location.coordinates[1],
      banner.location.coordinates[0]
    );

    res.json({
      success: true,
      data: {
        ...banner,
        distanceInMeters,
        distanceInKm: (distanceInMeters / 1000).toFixed(2)
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching banner with distance",
      error: error.message,
    });
  }
};

// Haversine formula to calculate distance between two lat/lng points
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in meters
}


// Update banner controller
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate banner ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid banner ID' });
    }

    // Extract form data
    const {
      title,
      google_location_url,
      website_url,
      banner_type,
      search_radius,
      manual_address,
      main_keyword,
      keyword,
      expiryDays,
      category,
      ownerId,
      'location[type]': locationType,
      'location[coordinates][0]': lng,
      'location[coordinates][1]': lat,
    } = req.body;

    // Prepare update object
    const updateData = {};

    // Handle fields conditionally
    if (title) updateData.title = title.trim();
    if (google_location_url) updateData.google_location_url = google_location_url.trim();
    if (website_url) updateData.website_url = website_url.trim();
    if (banner_type && ['Changeable', 'Unchangeable'].includes(banner_type)) {
      updateData.banner_type = banner_type;
    }
    if (search_radius && !isNaN(search_radius)) {
      updateData.search_radius = Number(search_radius);
    }
    if (manual_address) updateData.manual_address = manual_address.trim();
    if (main_keyword) updateData.main_keyword = main_keyword.split(',').map(k => k.trim()).filter(k => k);
    if (keyword) updateData.keyword = keyword.split(',').map(k => k.trim()).filter(k => k);
    if (expiryDays && !isNaN(expiryDays)) {
      const days = Number(expiryDays);
      if (days >= 0) {
        updateData.expiryAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    }
    if (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) {
      updateData.ownerId = ownerId;
    }

    // Handle category array
    if (category) {
      const categories = Array.isArray(category) ? category : [category];
      if (categories.every(id => mongoose.Types.ObjectId.isValid(id))) {
        updateData.category = categories;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid category IDs' });
      }
    }

    // Handle location
    if (locationType && lng && lat) {
      const longitude = Number(lng);
      const latitude = Number(lat);
      if (locationType === 'Point' && !isNaN(longitude) && !isNaN(latitude)) {
        updateData.location = {
          type: 'Point',
          coordinates: [longitude, latitude],
        };
      } else {
        return res.status(400).json({ success: false, message: 'Invalid location data' });
      }
    }

    // Handle file upload (OPTIONAL for updates)
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'banners');
        updateData.banner_image = uploadResult.secure_url;
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: 'Error uploading image',
          error: err.message
        });
      }
    }

    // Check if updateData is empty
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }

    // Find and update banner
    const banner = await Banner.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('category ownerId createdby promotion');

    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    // Return updated banner
    return res.status(200).json({
      success: true,
      data: banner,
      message: 'Banner updated successfully',
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Route definition




/* ===================================================
   1. Get My Banners (Partner/Agency/SuperAdmin)
   - Supports search, pagination, CSV export
=================================================== */


export const getMyBanners = async (req, res) => {
  try {
    const userId = req.user._id;
    const userType = req.user.type;
    const {
      page = 1,
      limit = 10,
      search,
      tag,
      category,
      exportCSV // if true → export
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
        { main_keyword: { $in: [search] } },
        { keyword: { $in: [search] } },
      ];
    }

    if (tag) filter.keyword = { $in: [tag] };
    if (category && mongoose.Types.ObjectId.isValid(category)) filter.category = category;

    const skip = (page - 1) * limit;

    let query = Banner.find(filter).populate("category", "name");
    const total = await Banner.countDocuments(filter);

    if (!exportCSV) {
      const banners = await query.skip(skip).limit(Number(limit)).lean();
      return res.status(200).json({
        success: true,
        page: Number(page),
        limit: Number(limit),
        total,
        data: banners,
      });
    }

    // Export CSV
    const allBanners = await query.lean();
    const exportData = allBanners.map(b => ({
      Title: b.title,
      Address: b.manual_address,
      BannerType: b.banner_type,
      Category: b.category?.name,
      CreatedAt: b.createdAt,
    }));
    return exportToCSV(res, exportData, "my_banners.csv");
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ===================================================
   2. Get All Banners (SuperAdmin)
   - Full details + search + pagination + CSV export
=================================================== */
export const getAllBannersForAdmin = async (req, res) => {
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
        { main_keyword: { $in: [search] } },
        { keyword: { $in: [search] } },
      ];
    }
    if (tag) filter.keyword = { $in: [tag] };
    if (category && mongoose.Types.ObjectId.isValid(category)) filter.category = category;

    const skip = (page - 1) * limit;

    let query = Banner.find(filter)
      .populate("category", "name")
      .populate("createdby", "name email type")
      .populate("ownerId", "name email type");

    const total = await Banner.countDocuments(filter);

    if (!exportCSV) {
      const banners = await query.skip(skip).limit(Number(limit)).lean();
      return res.status(200).json({
        success: true,
        page: Number(page),
        limit: Number(limit),
        total,
        data: banners,
      });
    }

    const allBanners = await query.lean();
    const exportData = allBanners.map(b => ({
      Title: b.title,
      Address: b.manual_address,
      BannerType: b.banner_type,
      Category: b.category?.name,
      CreatedBy: b.createdby?.name,
      OwnerBy: b.ownerId?.name,
      CreatedAt: b.createdAt,
    }));
    return exportToCSV(res, exportData, "all_banners.csv");
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};




