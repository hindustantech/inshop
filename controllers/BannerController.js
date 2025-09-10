import Banner from "../models/Banner.js";
import User from "../models/userModel.js";
// Create Banner (default expiry = 15 days, unless specified)
import { uploadToCloudinary } from "../utils/Cloudinary.js";


export const createBanner = async (req, res) => {
    try {
        const userId = req.user?.id;
        const userType = req.user?.type; // 'partner' | 'agency'

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
            expiryDays // number of days to expire
        } = req.body;

        // Validate user
        if (!["partner", "agency"].includes(userType)) {
            return res.status(401).json({ success: false, message: "Unauthorized Access Denied" });
        }

        // Validate coordinates
        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: "Latitude and Longitude are required" });
        }

        // Handle image upload
        let banner_image = null;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer, "banners");
            banner_image = uploadResult.secure_url;
        } else {
            return res.status(400).json({ success: false, message: "Banner image is required" });
        }

        // Convert keywords into arrays
        if (typeof main_keyword === "string") main_keyword = main_keyword.split(",").map(k => k.trim());
        if (typeof keyword === "string") keyword = keyword.split(",").map(k => k.trim());

        // Set expiryAt
        let expiryAt = null;
        if (expiryDays && !isNaN(expiryDays)) {
            expiryAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
        }

        // Create banner
        const banner = new Banner({
            createdBy: { id: userId, type: userType },
            banner_image,
            google_location_url,
            banner_type,
            manual_address,
            search_radius: search_radius || 100000,
            location: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
            title,
            main_keyword: Array.isArray(main_keyword) ? main_keyword : [],
            keyword: Array.isArray(keyword) ? keyword : [],
            expiryAt,
        });

        await banner.save();

        res.status(201).json({ success: true, message: "Banner created successfully", data: banner });

    } catch (error) {
        console.error("CreateBanner Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};



export const getUserNearestBanners = async (req, res) => {
    try {
        const userId = req.user.id;
        const { radius = 100000, search = "", page = 1, limit = 50, manualCode } = req.query;

        // Get user location
        const user = await User.findById(userId).select("latestLocation");
        if (!user?.latestLocation?.coordinates) {
            return res.status(404).json({ success: false, message: "User location not found" });
        }

        const [userLng, userLat] = user.latestLocation.coordinates;
        const skip = (page - 1) * limit;

        // Default mode
        let mode = "user";
        let baseLocation = { type: "Point", coordinates: [userLng, userLat] };
        let effectiveRadius = Number(radius);

        // Manual location
        let manualLocation = null;
        if (manualCode) {
            manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode }).select("city state location");

            if (manualLocation?.location?.coordinates) {
                const check = await ManualAddress.aggregate([
                    {
                        $geoNear: {
                            near: { type: "Point", coordinates: [userLng, userLat] },
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

        // Base pipeline
        const pipeline = [
            {
                $geoNear: {
                    near: baseLocation,
                    distanceField: "distance",
                    ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
                    spherical: true,
                    query: { expiryAt: { $gt: new Date() } }, // ignore expired banners
                },
            },
        ];

        // Manual mode → city filter
        if (mode === "manual" && manualLocation?.city) {
            pipeline.push({ $match: { manual_address: manualLocation.city } });
        }

        // Search filter (text index)
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

        // Sort + pagination + projection
        pipeline.push(
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

        // Run aggregation (facet for data + total)
        const [result] = await Banner.aggregate([
            {
                $facet: {
                    data: pipeline,
                    totalCount: [
                        ...pipeline.filter(
                            stage => !("$skip" in stage) && !("$limit" in stage) && !("$project" in stage) && !("$sort" in stage)
                        ),
                        { $count: "total" },
                    ],
                },
            },
        ]);

        const total = result.totalCount[0]?.total || 0;

        res.json({
            success: true,
            mode,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
            data: result.data,
        });

    } catch (err) {
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