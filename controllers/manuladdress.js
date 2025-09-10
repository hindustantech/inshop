import ManualAddress from "../models/ManualAddress.js";


// Helper function to generate code
const generateUniqueCode = async (city) => {
    const prefix = city.substring(0, 3).toUpperCase(); // e.g., "VAR" from "Varanasi"
    let code;
    let exists = true;

    while (exists) {
        const randomNum = Math.floor(100 + Math.random() * 900); // 3-digit random number
        code = `${prefix}${randomNum}`; // e.g., VAR123

        // check if already exists
        const existing = await ManualAddress.findOne({ uniqueCode: code });
        exists = !!existing;
    }

    return code;
};


// -------------------------------controller Function--------------------------------------


export const createManualAddress = async (req, res) => {
    try {
        const { city, state, country, coordinates } = req.body;

        if (!city || !coordinates || coordinates.length !== 2) {
            return res.status(400).json({
                message: "city and coordinates [lng, lat] are required",
            });
        }

        // Auto-generate unique code
        const uniqueCode = await generateUniqueCode(city);

        const manualAddress = new ManualAddress({
            city,
            uniqueCode,
            state: state || null,
            country: country || "India",
            location: {
                type: "Point",
                coordinates,
            },
        });

        await manualAddress.save();

        res.status(201).json({
            message: "Manual address created successfully",
            manualAddress,
        });
    } catch (error) {
        console.error("Error creating manual address:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};



export const getUserNearestBanners = async (req, res) => {
    try {
        const userId = req.user.id;
        const { radius = 100000, search = "", page = 1, limit = 50, manualCode } = req.query;

        // 1️⃣ Get user location
        const user = await User.findById(userId).select("latestLocation");
        if (!user?.latestLocation?.coordinates) {
            return res.status(404).json({ success: false, message: "User location not found" });
        }

        const [userLng, userLat] = user.latestLocation.coordinates;
        const skip = (page - 1) * limit;

        // 2️⃣ Default mode = user
        let mode = "user";
        let baseLocation = { type: "Point", coordinates: [userLng, userLat] };
        let effectiveRadius = Number(radius);

        // 3️⃣ Manual location (optional)
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
                    effectiveRadius = null; // manual mode → no radius limit
                }
            } else {
                // Invalid manualCode → fallback to user
                manualLocation = null;
                mode = "user";
                baseLocation = { type: "Point", coordinates: [userLng, userLat] };
                effectiveRadius = 100000; // default radius
            }
        }

        // 4️⃣ Build base pipeline for data
        const dataPipeline = [
            {
                $geoNear: {
                    near: baseLocation,
                    distanceField: "distance",
                    ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
                    spherical: true,
                    query: { expiryAt: { $gt: new Date() } }, // ignore expired
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

        // 5️⃣ Count total (without skip/limit/project)
        const countPipeline = [
            {
                $geoNear: {
                    near: baseLocation,
                    distanceField: "distance",
                    ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
                    spherical: true,
                    query: { expiryAt: { $gt: new Date() } },
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
                    ],
                },
            });
        }

        countPipeline.push({ $count: "total" });
        const totalResult = await Banner.aggregate(countPipeline);
        const total = totalResult[0]?.total || 0;

        // 6️⃣ Send response
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




