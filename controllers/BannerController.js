import Banner from "../models/Banner.js";
import User from "../models/userModel.js";
// Create Banner (default expiry = 15 days, unless specified)
import { uploadToCloudinary } from "../utils/Cloudinary.js";
import { exportToCSV } from "../utils/exportcsv.js";
import Category from "../models/CategoryCopun.js";
import mongoose from "mongoose";


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
      keyword,
      search_radius,
      manual_address,
      expiryDays, // number of days
      category,   // categoryId
      ownerId,    // only agency/super_admin can pass this
    } = req.body;

    /* ======================
       🔹 Role Validation
    ====================== */
    if (!["partner", "agency", "super_admin"].includes(userType)) {
      return res.status(401).json({ success: false, message: "Unauthorized Access" });
    }

    /* ======================
       🔹 Required Fields Validation
    ====================== */
    if (!title || !manual_address || !banner_type || !category || !lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, manual_address, banner_type, category, lat, lng",
      });
    }

    /* ======================
       🔹 Category Validation
    ====================== */
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ success: false, message: "Invalid category ID" });
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    /* ======================
       🔹 Image Validation
    ====================== */
    let banner_image = null;
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Banner image is required" });
    }
    try {
      const uploadResult = await uploadToCloudinary(req.file.buffer, "banners");
      banner_image = uploadResult.secure_url;
    } catch (err) {
      return res.status(500).json({ success: false, message: "Error uploading image", error: err.message });
    }

    /* ======================
       🔹 Keywords Formatting
    ====================== */
    if (typeof main_keyword === "string")
      main_keyword = main_keyword.split(",").map((k) => k.trim());

    if (typeof keyword === "string")
      keyword = keyword.split(",").map((k) => k.trim());

    /* ======================
       🔹 Expiry Calculation
    ====================== */
    let expiryAt = null;
    if (expiryDays && !isNaN(expiryDays)) {
      expiryAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    }

    /* ======================
       🔹 Handle createdBy & ownerId
    ====================== */
    let finalCreatedBy = userId;
    let finalOwnerId = userId;

    if (userType === "partner") {
      // Partner → createdBy = ownerId = self
      finalCreatedBy = userId;
      finalOwnerId = userId;
    } else if (["agency", "super_admin"].includes(userType)) {
      // Agency/SuperAdmin → createdBy = self, ownerId = provided or fallback to self
      finalCreatedBy = userId;

      if (ownerId) {
        if (!mongoose.Types.ObjectId.isValid(ownerId)) {
          return res.status(400).json({ success: false, message: "Invalid ownerId" });
        }
        const ownerExists = await User.findById(ownerId);
        if (!ownerExists) {
          return res.status(404).json({ success: false, message: "Owner user not found" });
        }
        finalOwnerId = ownerId;
      } else {
        // fallback: if no ownerId passed, store own userId
        finalOwnerId = userId;
      }
    }

    /* ======================
       🔹 Create Banner
    ====================== */
    const banner = new Banner({
      createdby: finalCreatedBy,
      ownerId: finalOwnerId,
      banner_image,
      google_location_url,
      banner_type,
      manual_address,
      search_radius: search_radius || 100000,
      location: {
        type: "Point",
        coordinates: [parseFloat(lng), parseFloat(lat)],
      },
      title,
      main_keyword: Array.isArray(main_keyword) ? main_keyword : [],
      keyword: Array.isArray(keyword) ? keyword : [],
      expiryAt,
      category,
    });

    await banner.save();

    return res.status(201).json({
      success: true,
      message: "Banner created successfully",
      data: banner,
    });
  } catch (error) {
    console.error("CreateBanner Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};/*  */

export const getUserNearestBanners = async (req, res) => {
    try {
        const { radius = 100000, search = "", page = 1, limit = 50, manualCode, lat, lng } = req.query;
        const skip = (page - 1) * limit;

        let mode = "user";
        let baseLocation = null;
        let effectiveRadius = Number(radius);

        // 1️⃣ Logged-in user
        if (req.user?.id) {
            const user = await User.findById(req.user.id).select("latestLocation");
            
            if (user?.latestLocation?.coordinates) {
                const [userLng, userLat] = user.latestLocation.coordinates;
                baseLocation = { type: "Point", coordinates: [userLng, userLat] };
            }
        }

        // 2️⃣ Manual location (or fallback)
        let manualLocation = null;
        if (manualCode) {
            manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode }).select("city state location");

            if (manualLocation?.location?.coordinates) {
                if (!baseLocation) {
                    // guest user → use manual location as base
                    baseLocation = manualLocation.location;
                    mode = "manual";
                    effectiveRadius = null; // no radius limit
                } else {
                    // logged-in user → check distance from manual location
                    const check = await ManualAddress.aggregate([
                        {
                            $geoNear: {
                                near: baseLocation,
                                distanceField: "distance",
                                spherical: true,
                                query: { uniqueCode: manualCode },
                                limit: 1,
                            },
                        },
                        { $project: { distance: 1 } },
                    ]);

                    const distance = check[0]?.distance || 0;
                    if (distance > 100000) {
                        mode = "manual";
                        baseLocation = manualLocation.location;
                        effectiveRadius = null;
                    }
                }
            }
        }

        // 3️⃣ Custom location from query params (lat, lng)
        if (lat && lng) {
            baseLocation = { type: "Point", coordinates: [Number(lng), Number(lat)] };
            mode = "custom";
            effectiveRadius = Number(radius) || 100000; // Use provided radius or default
        }

        // 4️⃣ Fallback for guest with no manualCode or custom location → use some default location
        if (!baseLocation) {
            // Example: center of India (can customize)
            baseLocation = { type: "Point", coordinates: [78.9629, 20.5937] };
            mode = "default";
        }

        // 5️⃣ Build aggregation pipeline
        const expiryQuery = { $or: [{ expiryAt: { $gt: new Date() } }, { expiryAt: null }] };

        const dataPipeline = [
            {
                $geoNear: {
                    near: baseLocation,
                    distanceField: "distance",
                    ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
                    spherical: true,
                    query: expiryQuery,
                },
            },
        ];

        if (mode === "manual" && manualLocation?.city) {
            dataPipeline.push({ $match: { manual_address: manualLocation.city } });
        }

        if (search.trim()) {
            dataPipeline.push({
                $match: {
                    $or: [
                        { title: { $regex: search, $options: "i" } },
                        { keyword: { $regex: search, $options: "i" } },
                        { main_keyword: { $regex: search, $options: "i" } },
                    ],
                },
            });
        }

        dataPipeline.push(
            { $sort: { distance: 1 } },
            { $skip: skip },
            { $limit: Number(limit) },
            {
                $project: {
                    banner_image: 1,
                    title: 1,
                    keyword: 1,
                    manual_address: 1,
                    location: 1,
                    distanceInKm: { $round: [{ $divide: ["$distance", 1000] }, 2] },
                },
            }
        );

        const data = await Banner.aggregate(dataPipeline);

        // Count total
        const countPipeline = [
            {
                $geoNear: {
                    near: baseLocation,
                    distanceField: "distance",
                    ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
                    spherical: true,
                    query: expiryQuery,
                },
            },
        ];

        if (mode === "manual" && manualLocation?.city) {
            countPipeline.push({ $match: { manual_address: manualLocation.city } });
        }

        if (search.trim()) {
            countPipeline.push({
                $match: {
                    $or: [
                        { title: { $regex: search, $options: "i" } },
                        { keyword: { $regex: search, $options: "i" } },
                        { main_keyword: { $regex: search, $options: "i" } },
                    ],
                },
            });
        }

        countPipeline.push({ $count: "total" });
        const totalResult = await Banner.aggregate(countPipeline);
        const total = totalResult[0]?.total || 0;

        // Send response
        res.json({
            success: true,
            mode,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
            data,
        });
    } catch (err) {
        console.error("Error fetching nearest banners:", err);
        res.status(500).json({ success: false, message: "Error fetching nearest banners", error: err.message });
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



export const getBannerById = async (req, res) => {
    try {
        const { bannerId } = req.params;

        if (!bannerId) {
            return res.status(400).json({
                success: false,
                message: "Banner ID is required",
            });
        }

        const banner = await Banner.findById(bannerId).lean();

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: "Banner not found",
            });
        }

        res.json({
            success: true,
            data: banner,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching banner details",
            error: error.message,
        });
    }
};






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




