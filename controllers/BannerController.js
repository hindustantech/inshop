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