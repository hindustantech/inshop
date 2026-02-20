// controllers/MallController.js
import Mall from "../models/MallSchema.js";
import PatnerProfile from "../models/PatnerProfile.js";
import ManualAddress from "../models/ManualAddress.js";
import mongoose from "mongoose";
import Banner from "../models/Banner.js";
import { parseAndValidateMallQuery } from "../services/queryParser.js";
import { locationFactory } from "../services/locationFactory.js";
import { buildMallAggregationPipeline } from "../services/pipelineBuilder.js";
import validator from "validator";
import User from "../models/userModel.js";
import Coupon from "../models/coupunModel.js";
import { uploadToCloudinary } from "../utils/Cloudinary.js";


export const createOrUpdateMall = async (req, res) => {
    try {
        const data = req.body;
        const { mallId } = data;

        console.log("Request received:", { mallId, body: data, files: req.files });

        // 1️⃣ Required fields for creation
        if (!mallId && (!data.name || !data.name.trim())) {
            return res.status(400).json({ success: false, message: "Mall name is required" });
        }
        if (!mallId && (!data.manul_address || !data.manul_address.trim())) {
            return res.status(400).json({ success: false, message: "Manual address is required" });
        }

        // 2️⃣ Parse JSON strings from form data
        let parsedData = { ...data };

        // Parse address if it's a string
        if (typeof data.address === 'string') {
            try {
                parsedData.address = JSON.parse(data.address);
            } catch (error) {
                console.error("Error parsing address:", error);
                parsedData.address = {};
            }
        }

        // Parse location if it's a string
        if (typeof data.location === 'string') {
            try {
                parsedData.location = JSON.parse(data.location);
            } catch (error) {
                console.error("Error parsing location:", error);
                parsedData.location = { coordinates: ["", ""] };
            }
        }

        // Parse contact if it's a string
        if (typeof data.contact === 'string') {
            try {
                parsedData.contact = JSON.parse(data.contact);
            } catch (error) {
                console.error("Error parsing contact:", error);
                parsedData.contact = {};
            }
        }

        // Parse facilities if it's a string
        if (typeof data.facilities === 'string') {
            try {
                parsedData.facilities = JSON.parse(data.facilities);
            } catch (error) {
                console.error("Error parsing facilities:", error);
                parsedData.facilities = {};
            }
        }

        // Parse timings if it's a string
        if (typeof data.timings === 'string') {
            try {
                parsedData.timings = JSON.parse(data.timings);
            } catch (error) {
                console.error("Error parsing timings:", error);
                parsedData.timings = {};
            }
        }

        // 3️⃣ Location validation
        if (parsedData.location?.coordinates) {
            if (
                !Array.isArray(parsedData.location.coordinates) ||
                parsedData.location.coordinates.length !== 2 ||
                isNaN(parsedData.location.coordinates[0]) ||
                isNaN(parsedData.location.coordinates[1])
            ) {
                return res.status(400).json({ success: false, message: "Valid location coordinates [lng, lat] are required" });
            }
        }

        // 4️⃣ Contact validation
        if (parsedData.contact?.email && !validator.isEmail(parsedData.contact.email)) {
            return res.status(400).json({ success: false, message: "Invalid email address" });
        }
        if (parsedData.contact?.phone && !validator.isMobilePhone(parsedData.contact.phone, "any")) {
            return res.status(400).json({ success: false, message: "Invalid phone number" });
        }
        if (parsedData.contact?.website && parsedData.contact.website.trim() !== "" && !validator.isURL(parsedData.contact.website)) {
            return res.status(400).json({ success: false, message: "Invalid website URL" });
        }

        // -----------------------------
        // 5️⃣ IMAGE UPLOAD SECTION
        // -----------------------------

        let logoUrl = null;
        let galleryUrls = [];

        // ⭐ Upload LOGO file (only if new file is provided)
        if (req.files?.logo && req.files.logo[0]) {
            console.log("Uploading logo...");
            try {
                const logoBuffer = req.files.logo[0].buffer;
                const uploadedLogo = await uploadToCloudinary(logoBuffer, "mall/logo");
                logoUrl = uploadedLogo.secure_url;
                console.log("Logo uploaded:", logoUrl);
            } catch (error) {
                console.error("Error uploading logo:", error);
                return res.status(500).json({ success: false, message: "Error uploading logo" });
            }
        } else if (mallId) {
            // Keep existing logo if updating and no new logo provided
            const existingMall = await Mall.findById(mallId);
            logoUrl = existingMall?.logo || "";
        }

        // ⭐ Upload GALLERY images (only if new files are provided)
        if (req.files?.gallery && req.files.gallery.length > 0) {
            console.log(`Uploading ${req.files.gallery.length} gallery images...`);
            try {
                for (const file of req.files.gallery) {
                    const uploaded = await uploadToCloudinary(file.buffer, "mall/gallery");
                    galleryUrls.push({
                        image: uploaded.secure_url,
                        caption: ""
                    });
                }
                console.log("Gallery images uploaded:", galleryUrls.length);
            } catch (error) {
                console.error("Error uploading gallery:", error);
                return res.status(500).json({ success: false, message: "Error uploading gallery images" });
            }
        } else if (mallId && parsedData.gallery) {
            // Handle gallery from form data or keep existing
            if (typeof parsedData.gallery === 'string') {
                try {
                    galleryUrls = JSON.parse(parsedData.gallery);
                } catch (error) {
                    console.error("Error parsing gallery:", error);
                }
            } else if (Array.isArray(parsedData.gallery)) {
                galleryUrls = parsedData.gallery;
            }
        }

        // 6️⃣ Prepare sanitized data
        const mallData = {
            name: parsedData.name?.trim() || "",
            tagline: parsedData.tagline?.trim() || "",
            description: parsedData.description?.trim() || "",
            manul_address: parsedData.manul_address?.trim() || "",
            address: {
                street: parsedData.address?.street?.trim() || "",
                area: parsedData.address?.area?.trim() || "",
                city: parsedData.address?.city?.trim() || "",
                state: parsedData.address?.state?.trim() || "",
                country: parsedData.address?.country?.trim() || "India",
                pincode: parsedData.address?.pincode?.trim() || "",
            },
            location: parsedData.location?.coordinates
                ? {
                    type: "Point",
                    coordinates: parsedData.location.coordinates.map(coord =>
                        typeof coord === 'string' ? parseFloat(coord) || 0 : coord
                    )
                }
                : undefined,
            contact: {
                phone: parsedData.contact?.phone || "",
                email: parsedData.contact?.email || "",
                website: parsedData.contact?.website || "",
            },
            facilities: {
                parking: parsedData.facilities?.parking || false,
                foodCourt: parsedData.facilities?.foodCourt || false,
                kidsZone: parsedData.facilities?.kidsZone || false,
                wheelchairAccess: parsedData.facilities?.wheelchairAccess || false,
                cinema: parsedData.facilities?.cinema || false,
                restrooms: parsedData.facilities?.restrooms !== undefined ? parsedData.facilities.restrooms : true,
                atm: parsedData.facilities?.atm !== undefined ? parsedData.facilities.atm : true,
                wifi: parsedData.facilities?.wifi || false,
            },
            timings: {
                open: parsedData.timings?.open || "10:00 AM",
                close: parsedData.timings?.close || "10:00 PM",
                closedOn: parsedData.timings?.closedOn || "None",
            },
            active: parsedData.active !== undefined ? parsedData.active : true,
        };

        // Only add logo if it has a value
        if (logoUrl !== null) {
            mallData.logo = logoUrl;
        }

        // Only add gallery if it has values
        if (galleryUrls.length > 0) {
            mallData.gallery = galleryUrls;
        }

        console.log("Prepared mall data:", mallData);

        let mall;

        if (mallId) {
            // 7️⃣ Update mall
            mall = await Mall.findByIdAndUpdate(mallId, mallData, { new: true, runValidators: true });
            if (!mall) {
                return res.status(404).json({ success: false, message: "Mall not found to update" });
            }
            return res.status(200).json({ success: true, message: "Mall updated successfully", mall });
        } else {
            // 8️⃣ Create mall - ensure location is provided
            if (!mallData.location || !mallData.location.coordinates) {
                return res.status(400).json({ success: false, message: "Location coordinates are required for new mall" });
            }
            mall = await Mall.create(mallData);
            return res.status(201).json({ success: true, message: "Mall created successfully", mall });
        }

    } catch (error) {
        console.error("Error in createOrUpdateMall:", error);
        res.status(500).json({ success: false, message: "Something went wrong", error: error.message });
    }
};

// Rest of the controller functions remain the same...
export const getMallsWithUserLocation = async (req, res) => {
    try {
        const MAX_RADIUS = 100000; // 100km in meters
        const DEFAULT_CENTER = [78.9629, 20.5937]; // India center [lng, lat]

        /* ===============================
           1️⃣ Parse Query Parameters
        =============================== */
        const {
            radius = MAX_RADIUS,
            search = '',
            page = 1,
            limit = 50,
            manualCode,
            lat,
            lng,
            sortOrder = 'asc' // 'asc' for nearest first, 'desc' for farthest first
        } = req.query;

        // Validate and parse pagination
        const parsedPage = parseInt(page);
        const parsedLimit = parseInt(limit);
        let parsedRadius = parseInt(radius);

        if (isNaN(parsedPage) || parsedPage < 1) {
            return res.status(400).json({ success: false, message: "Invalid page number" });
        }
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
            return res.status(400).json({ success: false, message: "Invalid limit (1-100)" });
        }
        if (isNaN(parsedRadius) || parsedRadius < 0) {
            return res.status(400).json({ success: false, message: "Invalid radius" });
        }

        parsedRadius = Math.min(parsedRadius, MAX_RADIUS);
        const skip = (parsedPage - 1) * parsedLimit;

        // Validate sort order
        const sortDirection = sortOrder === 'desc' ? 1 : -1; // Note: -1 is ascending for distance (nearest first)

        /* ===============================
           2️⃣ Build Search Regex (if any)
        =============================== */
        let searchRegex = null;
        if (search.trim()) {
            const sanitizedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            searchRegex = new RegExp(sanitizedSearch, "i");
        }

        /* ===============================
           3️⃣ Resolve Base Location by Mode Priority
        =============================== */
        let baseLocation = null;
        let locationMode = "default";
        let locationSource = null;
        let effectiveRadius = parsedRadius;
        let locationDetails = {};

        // Helper function to validate coordinates
        const isValidCoordinates = (coords) => {
            return coords &&
                Array.isArray(coords) &&
                coords.length === 2 &&
                !isNaN(coords[0]) &&
                !isNaN(coords[1]) &&
                !(coords[0] === 0 && coords[1] === 0);
        };

        // MODE 1: User Location (Highest Priority)
        if (req.user?._id && mongoose.isValidObjectId(req.user._id)) {
            try {
                const user = await User.findById(req.user._id)
                    .select("latestLocation name email")
                    .lean();

                if (user?.latestLocation?.coordinates &&
                    isValidCoordinates(user.latestLocation.coordinates)) {

                    const [lngU, latU] = user.latestLocation.coordinates;
                    baseLocation = {
                        type: "Point",
                        coordinates: [lngU, latU]
                    };
                    locationMode = "user";
                    locationSource = "authenticated_user";
                    locationDetails = {
                        userId: req.user._id,
                        userName: user.name || 'Unknown',
                        coordinates: { lng: lngU, lat: latU }
                    };
                    console.log(`📍 Mode: User Location - [${latU}, ${lngU}]`);
                }
            } catch (userError) {
                console.error("Error fetching user location:", userError);
            }
        }

        // MODE 2: Custom Lat/Lng (if user location not available)
        if (!baseLocation && lat && lng) {
            const parsedLat = Number(lat);
            const parsedLng = Number(lng);

            if (!isNaN(parsedLat) && !isNaN(parsedLng) &&
                parsedLat >= -90 && parsedLat <= 90 &&
                parsedLng >= -180 && parsedLng <= 180) {

                baseLocation = {
                    type: "Point",
                    coordinates: [parsedLng, parsedLat]
                };
                locationMode = "custom";
                locationSource = "query_parameters";
                locationDetails = {
                    coordinates: { lat: parsedLat, lng: parsedLng }
                };
                console.log(`📍 Mode: Custom Location - [${parsedLat}, ${parsedLng}]`);
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Invalid coordinates provided. Lat must be between -90 and 90, Lng between -180 and 180"
                });
            }
        }

        // MODE 3: Manual Code (if user location and custom lat/lng not available)
        if (!baseLocation && manualCode) {
            try {
                const manual = await ManualAddress.findOne({
                    uniqueCode: manualCode,
                    isActive: true
                })
                    .select("location city state country uniqueCode")
                    .lean();

                if (manual?.location?.coordinates &&
                    isValidCoordinates(manual.location.coordinates)) {

                    baseLocation = {
                        type: "Point",
                        coordinates: manual.location.coordinates
                    };
                    locationMode = "manual";
                    locationSource = "manual_address_code";
                    locationDetails = {
                        code: manual.uniqueCode,
                        city: manual.city,
                        state: manual.state,
                        country: manual.country
                    };
                    console.log(`📍 Mode: Manual Code - ${manual.uniqueCode} (${manual.city})`);
                } else {
                    return res.status(404).json({
                        success: false,
                        message: "Invalid or inactive manual code provided"
                    });
                }
            } catch (manualError) {
                console.error("Error fetching manual address:", manualError);
                return res.status(404).json({
                    success: false,
                    message: "Manual code not found"
                });
            }
        }

        // MODE 4: Default Fallback (if no location resolved)
        if (!baseLocation) {
            baseLocation = {
                type: "Point",
                coordinates: DEFAULT_CENTER
            };
            locationMode = "default";
            locationSource = "system_fallback";
            effectiveRadius = null; // No radius limit for default mode
            locationDetails = {
                coordinates: { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] },
                note: "Using India center as default location"
            };
            console.log(`📍 Mode: Default Fallback - India Center`);
        }

        /* ===============================
           4️⃣ Build Geo Query
        =============================== */
        const geoQuery = {
            active: true
        };

        // Add search conditions if search term exists
        if (searchRegex) {
            geoQuery.$or = [
                { name: searchRegex },
                { tagline: searchRegex },
                { manul_address: searchRegex },
                { "address.city": searchRegex },
                { "address.area": searchRegex },
                { "address.state": searchRegex },
                { "address.street": searchRegex },
                { description: searchRegex }
            ];
        }

        /* ===============================
           5️⃣ Aggregation Pipeline with Distance-Only Sorting
        =============================== */
        const pipeline = [];

        // Add $geoNear stage if we have a location
        if (baseLocation) {
            const geoNearStage = {
                $geoNear: {
                    near: baseLocation,
                    distanceField: "distance",
                    spherical: true,
                    query: geoQuery,
                    key: "location"
                }
            };

            // Add maxDistance only if effectiveRadius exists
            if (effectiveRadius) {
                geoNearStage.$geoNear.maxDistance = effectiveRadius;
            }

            pipeline.push(geoNearStage);
        } else {
            // Fallback if no location (shouldn't happen due to default)
            pipeline.push(
                { $match: geoQuery },
                { $addFields: { distance: null } }
            );
        }

        // Add distance conversion field
        pipeline.push({
            $addFields: {
                distanceInKm: {
                    $cond: {
                        if: { $ifNull: ["$distance", false] },
                        then: { $round: [{ $divide: ["$distance", 1000] }, 2] },
                        else: null
                    }
                }
            }
        });

        // Apply DISTANCE-ONLY sorting
        // If we have a location, sort by distance
        // If no location (default mode), sort by name as fallback
        if (baseLocation && locationMode !== 'default') {
            // Sort by distance only (nearest or farthest based on sortOrder)
            pipeline.push({
                $sort: {
                    distance: sortDirection,  // -1 = nearest first, 1 = farthest first
                    name: 1 // Secondary sort by name for consistent pagination
                }
            });
        } else {
            // Default mode - no location, so sort by name
            pipeline.push({
                $sort: { name: 1 }
            });
        }

        // Add facet for pagination
        pipeline.push({
            $facet: {
                paginatedResults: [
                    { $skip: skip },
                    { $limit: parsedLimit },
                    {
                        $project: {
                            name: 1,
                            tagline: 1,
                            manul_address: 1,
                            address: 1,
                            logo: 1,
                            rating: 1,
                            facilities: 1,
                            contact: 1,
                            timings: 1,
                            description: 1,
                            distance: 1,
                            distanceInKm: 1,
                            gallery: { $slice: ["$gallery", 3] }
                        }
                    }
                ],
                totalCount: [
                    { $count: "total" }
                ],
                // Add facet for distance statistics
                distanceStats: [
                    {
                        $match: {
                            distance: { $exists: true, $ne: null }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            minDistance: { $min: "$distanceInKm" },
                            maxDistance: { $max: "$distanceInKm" },
                            avgDistance: { $avg: "$distanceInKm" },
                            totalWithDistance: { $sum: 1 }
                        }
                    }
                ]
            }
        });

        // Execute aggregation
        console.log(`🔍 Executing query with mode: ${locationMode}, sort: ${sortOrder === 'asc' ? 'nearest first' : 'farthest first'}`);
        const result = await Mall.aggregate(pipeline);

        const malls = result[0]?.paginatedResults || [];
        const total = result[0]?.totalCount[0]?.total || 0;
        const distanceStats = result[0]?.distanceStats[0] || null;

        /* ===============================
           6️⃣ Success Response with Distance-Only Sorting
        =============================== */
        res.status(200).json({
            success: true,
            mode: {
                type: locationMode,
                source: locationSource,
                details: locationDetails,
                radius: effectiveRadius ? {
                    value: effectiveRadius,
                    unit: "meters",
                    inKm: (effectiveRadius / 1000).toFixed(2)
                } : null
            },
            sorting: {
                type: "distance_only",
                order: sortOrder === 'asc' ? 'nearest_first' : 'farthest_first',
                applied: locationMode !== 'default' ? 'distance_based' : 'alphabetical_fallback'
            },
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total,
                pages: total ? Math.ceil(total / parsedLimit) : 0,
                hasNextPage: parsedPage < Math.ceil(total / parsedLimit),
                hasPrevPage: parsedPage > 1
            },
            search: search.trim() ? {
                term: search,
                regex: searchRegex ? searchRegex.toString() : null
            } : null,
            distanceStats: distanceStats ? {
                nearest: distanceStats.minDistance?.toFixed(2) + " km",
                farthest: distanceStats.maxDistance?.toFixed(2) + " km",
                average: distanceStats.avgDistance?.toFixed(2) + " km",
                totalWithDistance: distanceStats.totalWithDistance
            } : null,
            data: malls.map(mall => ({
                ...mall,
                // Add distance indicator
                distance: mall.distanceInKm ? {
                    value: mall.distanceInKm,
                    unit: "km",
                    text: mall.distanceInKm + " km away"
                } : null
            }))
        });

    } catch (error) {
        console.error("Mall Fetch Error:", {
            message: error.message,
            stack: error.stack,
            query: req.query,
            user: req.user?._id
        });

        // Differentiate between error types
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: "Invalid data format in query"
            });
        }

        if (error.code === 16755) { // GeoNear error
            return res.status(400).json({
                success: false,
                message: "Invalid geospatial query parameters"
            });
        }

        res.status(500).json({
            success: false,
            message: "An error occurred while fetching malls",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getMallshop = async (req, res) => {
    try {
        const { mallId, search = '', page = 1, limit = 10 } = req.query;

        // ✅ 1. Validate mallId
        if (!mallId) {
            return res.status(400).json({
                message: "Mall ID not provided",
                success: false,
            });
        }

        const parsedPage = parseInt(page);
        const parsedLimit = parseInt(limit);

        if (isNaN(parsedPage) || parsedPage < 1)
            return res.status(400).json({ success: false, message: "Invalid page number" });
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)
            return res.status(400).json({ success: false, message: "Invalid limit value" });

        const skip = (parsedPage - 1) * parsedLimit;

        // ✅ 2. Build query to fetch shops under this mall only
        const query = {
            mallId,
            isIndependent: false // only shops linked to malls
        };

        // ✅ 3. Optional search by firm_name or email
        if (search.trim()) {
            const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$or = [
                { firm_name: searchRegex },
                { email: searchRegex }
            ];
        }

        // ✅ 4. Fetch total and paginated shops
        const total = await PatnerProfile.countDocuments(query);
        const shopunderthemall = await PatnerProfile.find(query)
            .skip(skip)
            .limit(parsedLimit)
            .sort({ createdAt: -1 })
            .populate("User_id", "name email type") // optional: populate owner details
            .populate("mallId", "name") // optional: mall name
            .lean();

        // ✅ 5. Send response
        res.status(200).json({
            success: true,
            message: "Shops under this mall fetched successfully",
            page: parsedPage,
            limit: parsedLimit,
            total,
            pages: total ? Math.ceil(total / parsedLimit) : 0,
            mallshop: shopunderthemall
        });

    } catch (error) {
        console.error("Error fetching mall shops:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error.message
        });
    }
};

export const getMallshopCoupon = async (req, res) => {
    try {
        const { patnerId } = req.query;

        // 1️⃣ Find the shop using partner ID
        const shop = await PatnerProfile.findById(patnerId);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: "Shop not found",
            });
        }

        // 2️⃣ Find all active and valid coupons
        const coupons = await Coupon.find({
            ownerId: shop.User_id,
            active: true,
            validTill: { $gte: new Date() }, // coupon still valid
        })
            .sort({ creationDate: -1 }) // latest first
            .lean(); // faster, returns plain JS objects

        // 3️⃣ No coupons found case
        if (!coupons.length) {
            return res.status(200).json({
                success: true,
                message: "No active coupons found for this shop",
                data: [],
            });
        }

        // 4️⃣ Success Response
        res.status(200).json({
            success: true,
            count: coupons.length,
            data: coupons,
        });

    } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

export const getMallshopBanner = async (req, res) => {
    try {
        const { patnerId } = req.query;

        // 1️⃣ Find the shop using partner ID
        const shop = await PatnerProfile.findById(patnerId);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: "Shop not found",
            });
        }

        // 2️⃣ Find all active banners (not expired)
        const banners = await Banner.find({
            ownerId: shop.User_id,
            $or: [
                { expiryAt: null }, // No expiry
                { expiryAt: { $gte: new Date() } }, // Still valid
            ],
        })
            .sort({ createdAt: -1 }) // latest first
            .lean();

        // 3️⃣ No banners found case
        if (!banners.length) {
            return res.status(200).json({
                success: true,
                message: "No active banners found for this shop",
                data: [],
            });
        }

        // 4️⃣ Success Response
        res.status(200).json({
            success: true,
            count: banners.length,
            data: banners,
        });

    } catch (error) {
        console.error("Error fetching banners:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
}


export const addintomall = async (req, res) => {
    const { mallId, userId } = req.body;

    // 1️⃣ Basic validation
    if (!mongoose.Types.ObjectId.isValid(mallId) ||
        !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid mallId or userId",
        });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 2️⃣ Fetch shop
        const shop = await PatnerProfile.findOne(
            { User_id: userId },
            null,
            { session }
        );

        if (!shop) {
            throw new Error("SHOP_NOT_FOUND");
        }

        // 3️⃣ Idempotency check
        if (shop.mallId?.toString() === mallId) {
            await session.abortTransaction();
            return res.status(200).json({
                success: true,
                message: "Shop already linked to this mall",
            });
        }

        // 4️⃣ Fetch mall
        const mall = await Mall.findById(mallId, null, { session });
        if (!mall) {
            throw new Error("MALL_NOT_FOUND");
        }

        // 5️⃣ Domain rule: prevent reassignment (optional business rule)
        if (shop.mallId && shop.mallId.toString() !== mallId) {
            throw new Error("SHOP_ALREADY_ASSIGNED_TO_ANOTHER_MALL");
        }

        // 6️⃣ Update shop
        shop.mallId = mall._id;
        shop.isIndependent = false;
        await shop.save({ session });

        // 7️⃣ Update mall (deduplicated)
        mall.shops.addToSet(shop._id);
        await mall.save({ session });

        // 8️⃣ Commit
        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: "Shop successfully added to mall",
            data: {
                mallId: mall._id,
                shopId: shop._id,
            },
        });

    } catch (err) {
        await session.abortTransaction();

        const errorMap = {
            SHOP_NOT_FOUND: { status: 404, message: "Shop not found" },
            MALL_NOT_FOUND: { status: 404, message: "Mall not found" },
            SHOP_ALREADY_ASSIGNED_TO_ANOTHER_MALL: {
                status: 409,
                message: "Shop is already linked to another mall",
            },
        };

        const mapped = errorMap[err.message];

        return res.status(mapped?.status || 500).json({
            success: false,
            message: mapped?.message || "Internal server error",
        });
    } finally {
        session.endSession();
    }
};


export const getAllMall = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10, status } = req.query;

        const parsedPage = parseInt(page);
        const parsedLimit = parseInt(limit);

        if (isNaN(parsedPage) || parsedPage < 1) {
            return res.status(400).json({ success: false, message: "Invalid page number" });
        }

        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
            return res.status(400).json({ success: false, message: "Invalid limit" });
        }

        const skip = (parsedPage - 1) * parsedLimit;

        // 🔍 Build search filter
        const query = {};

        // Filter by search term (name, city, state, manual address)
        if (search.trim()) {
            const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$or = [
                { name: searchRegex },
                { "address.city": searchRegex },
                { "address.state": searchRegex },
                { manul_address: searchRegex },
            ];
        }

        // ✅ Filter by active/inactive status if provided
        if (status === "active") {
            query.active = true;
        } else if (status === "inactive") {
            query.active = false;
        }

        // 📊 Count summary (for dashboard display)
        const [total, activeCount, inactiveCount] = await Promise.all([
            Mall.countDocuments(),
            Mall.countDocuments({ active: true }),
            Mall.countDocuments({ active: false })
        ]);

        // 🧾 Get filtered count for pagination
        const filteredTotal = await Mall.countDocuments(query);

        // ⚡ Fetch paginated mall data
        const malls = await Mall.find(query)
            .skip(skip)
            .limit(parsedLimit)
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: "Malls fetched successfully",
            page: parsedPage,
            limit: parsedLimit,
            totalMalls: total,
            activeMalls: activeCount,
            inactiveMalls: inactiveCount,
            filteredTotal,
            totalPages: filteredTotal ? Math.ceil(filteredTotal / parsedLimit) : 0,
            malls,
        });

    } catch (error) {
        console.error("Error fetching malls:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong while fetching malls",
        });
    }
};

export const getPartnerByPhone = async (req, res) => {
    try {
        const { phone } = req.query;

        // ✅ 1. Validate phone input
        if (!phone || phone.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Phone number is required",
            });
        }

        // ✅ 2. Find the user with type = 'partner'
        const user = await User.findOne({ phone, type: "partner" });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "No partner found with this phone number",
            });
        }

        // ✅ 3. Fetch the partner profile (if available)
        const partnerProfile = await PatnerProfile.findOne({ User_id: user._id })
            .populate("mallId", "name address") // optional: get mall details if linked
            .lean();

        // ✅ 4. Respond with full data
        return res.status(200).json({
            success: true,
            message: "Partner found successfully",
            user,
            partnerProfile: partnerProfile || null,
        });
    } catch (error) {
        console.error("Error finding partner by phone:", error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong while fetching partner details",
        });
    }
};