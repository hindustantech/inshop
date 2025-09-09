import Banner from "../models/Banner.js";
import User from "../models/userModel.js";
// Create Banner (default expiry = 15 days, unless specified)
import { uploadToCloudinary } from "../utils/Cloudinary.js";

export const createBanner = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.type; // 'partner' | 'agency'

    let {
      google_location_url,
      banner_type,
      lat,
      lng,
      title,
      main_keyword,
      keyword,
      search_radius,
    } = req.body;

    // ✅ Validate user
    if (!["partner", "agency"].includes(userType)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized Access Denied",
      });
    }

    // ✅ Validate coordinates
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude are required",
      });
    }

    // ✅ Handle image upload (Cloudinary)
    let banner_image = null;
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, "banners");
      banner_image = uploadResult.secure_url;
    } else {
      return res.status(400).json({
        success: false,
        message: "Banner image is required",
      });
    }

    // ✅ Convert keywords into arrays
    if (typeof main_keyword === "string") {
      main_keyword = main_keyword.split(",").map((k) => k.trim());
    }
    if (typeof keyword === "string") {
      keyword = keyword.split(",").map((k) => k.trim());
    }

    // ✅ Create new banner
    const banner = new Banner({
      createdBy: { id: userId, type: userType },
      banner_image,
      google_location_url,
      banner_type,
      search_radius: search_radius || 100000,
      location: {
        type: "Point",
        coordinates: [parseFloat(lng), parseFloat(lat)],
      },
      title,
      main_keyword: Array.isArray(main_keyword) ? main_keyword : [],
      keyword: Array.isArray(keyword) ? keyword : [],
    });

    await banner.save();

    res.status(201).json({
      success: true,
      message: "Banner created successfully",
      data: banner,
    });
  } catch (error) {
    console.error("CreateBanner Error:", error);
    res.status(500).json({ success: false, message: error.message });
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


export const getUserNearestBanners = async (req, res) => {
    try {
        const { userId } = req.params;
        const { radius = 100000, search = "", page = 1, limit = 50 } = req.query;

        // 🔹 1. Get user location
        const user = await User.findById(userId).select("latestLocation");
        if (!user?.latestLocation?.coordinates) {
            return res.status(404).json({ success: false, message: "User location not found" });
        }

        const [lng, lat] = user.latestLocation.coordinates;
        const skip = (page - 1) * limit;

        // 🔹 2. Base aggregation (GeoNear always first)
        const pipeline = [
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [lng, lat] },
                    distanceField: "distance",
                    maxDistance: Number(radius),
                    spherical: true,
                },
            },
        ];

        // 🔹 3. Search filter
        if (search.trim()) {
            pipeline.push({
                $match: {
                    $or: [
                        { title: { $regex: search, $options: "i" } },
                        { keyword: { $regex: search, $options: "i" } },
                    ],
                },
            });
        }

        // 🔹 4. Sort, Pagination
        pipeline.push(
            { $sort: { distance: 1 } },
            { $skip: skip },
            { $limit: Number(limit) },
            {
                $project: {
                    banner_image: 1,
                    title: 1,
                    keyword: 1,
                    location: 1,
                    distanceInKm: { $round: [{ $divide: ["$distance", 1000] }, 2] }, // convert meters → km
                },
            }
        );

        // 🔹 5. Run in parallel (data + count)
        const [data, totalResult] = await Promise.all([
            Banner.aggregate(pipeline),
            Banner.aggregate([...pipeline.slice(0, -3), { $count: "total" }]),
        ]);

        const total = totalResult[0]?.total || 0;

        // 🔹 6. Response
        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
            data,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching nearest banners", error: err.message });
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