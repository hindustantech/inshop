// controllers/promotionalBannerController.js
import PromotionalBanner from "../models/PromotionalBanner.js";
import User from "../models/userModel.js";
import ManualAddress from "../models/ManualAddress.js";
import mongoose from "mongoose";
import { uploadToCloudinary } from "../utils/Cloudinary.js";


router.post("/", upload.single('bannerImage'), createPromotionalBanner);

export const createPromotionalBanner = async (req, res) => {
    try {
        const {
            createdBy,
            ownerId,
            title,
            description,
            manualAddress,
            coordinates,
            searchRadius,
            expiryAt
        } = req.body;

        // Validation
        if (!ownerId || !title || !manualAddress) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: ownerId, title, and manualAddress are required"
            });
        }

        // Validate coordinates if provided
        let parsedCoordinates = [0, 0];
        if (coordinates) {
            try {
                parsedCoordinates = Array.isArray(coordinates) ? coordinates : JSON.parse(coordinates);
                if (!Array.isArray(parsedCoordinates) || parsedCoordinates.length !== 2) {
                    throw new Error('Invalid coordinates format');
                }
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid coordinates format. Expected [longitude, latitude]"
                });
            }
        }

        // Validate searchRadius
        const radius = searchRadius ? parseFloat(searchRadius) : 0;
        if (radius < 0) {
            return res.status(400).json({
                success: false,
                message: "Search radius must be a positive number"
            });
        }

        // Upload image if provided
        let bannerImage = null;
        if (req.file) {
            try {
                bannerImage = await uploadToCloudinary(req.file.buffer, 'banners');
            } catch (uploadError) {
                console.error("Error uploading image:", uploadError);
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload banner image"
                });
            }
        }

        // Validate expiry date
        let expiryDate = null;
        if (expiryAt) {
            expiryDate = new Date(expiryAt);
            if (isNaN(expiryDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid expiry date format"
                });
            }
            
            // Check if expiry date is in the future
            if (expiryDate <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Expiry date must be in the future"
                });
            }
        }

        const newBanner = new PromotionalBanner({
            createdBy: createdBy || ownerId, // Fallback to ownerId if createdBy not provided
            ownerId,
            title: title.trim(),
            description: description?.trim() || '',
            bannerImage,
            manualAddress,
            location: {
                type: "Point",
                coordinates: parsedCoordinates,
            },
            searchRadius: radius,
            expiryAt: expiryDate,
            status: 'active'
        });

        await newBanner.save();

        // Populate the response with user details if needed
        const populatedBanner = await PromotionalBanner.findById(newBanner._id)
            .populate('ownerId', 'name email phone')
            .populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: "Promotional banner created successfully",
            data: populatedBanner,
        });
    } catch (error) {
        console.error("Error creating promotional banner:", error);
        
        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A banner with similar details already exists"
            });
        }
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to create promotional banner",
            error: error.message,
        });
    }
};


export const getPromotionalBanners = async (req, res) => {
    try {
        // 1️⃣ Extract query parameters
        const {
            radius = 100000, // Default: 100 km
            search = '',
            page = 1,
            limit = 50,
            manualCode,
            lat,
            lng,
            status = 'active', // Filter by status
        } = req.query;

        const skip = (page - 1) * limit;
        let mode = 'user';
        let baseLocation = null;
        let effectiveRadius = Number(radius) || 100000;

        // 2️⃣ Get user location (if logged in)
        if (req.user?.id) {
            const user = await User.findById(req.user.id).select('latestLocation');
            if (user?.latestLocation?.coordinates) {
                const [userLng, userLat] = user.latestLocation.coordinates;
                baseLocation = { type: 'Point', coordinates: [userLng, userLat] };
                console.log(`User location: ${JSON.stringify(baseLocation)}`);
            }
        }

        // 3️⃣ Handle manual address
        let manualLocation = null;
        if (manualCode) {
            manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode }).select('city location');
            if (!manualLocation?.location?.coordinates) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid or not found manual address code: ${manualCode}`,
                });
            }
            if (!baseLocation) {
                // Guest user: Use manual location
                baseLocation = manualLocation.location;
                mode = 'manual';
                console.log(`Manual location: ${JSON.stringify(baseLocation)}, radius: ${effectiveRadius}`);
            } else {
                // Logged-in user: Check distance to manual location
                const distanceCheck = await ManualAddress.aggregate([
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

                const distance = distanceCheck[0]?.distance || 0;
                if (distance > 100000) {
                    // Switch to manual location if > 100 km
                    baseLocation = manualLocation.location;
                    mode = 'manual';
                    console.log(`Switched to manual location: ${JSON.stringify(baseLocation)}`);
                }
            }
        }

        // 4️⃣ Handle custom lat/lng
        if (lat && lng) {
            const parsedLat = Number(lat);
            const parsedLng = Number(lng);
            if (isNaN(parsedLat) || isNaN(parsedLng)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid latitude or longitude',
                });
            }
            baseLocation = { type: 'Point', coordinates: [parsedLng, parsedLat] };
            mode = 'custom';
            console.log(`Custom location: ${JSON.stringify(baseLocation)}, radius: ${effectiveRadius}`);
        }

        // 5️⃣ Fallback to default location (center of India)
        if (!baseLocation) {
            baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] };
            mode = 'default';
            effectiveRadius = null; // No radius limit for default
            console.log(`Default location: ${JSON.stringify(baseLocation)}`);
        }

        // 6️⃣ Build filters
        const statusFilter = { status: status }; // Use status from query or default to 'active'
        const expiryQuery = { $or: [{ expiryAt: { $gt: new Date() } }, { expiryAt: null }] };

        // 7️⃣ Build main aggregation pipeline
        const dataPipeline = [
            {
                $geoNear: {
                    near: baseLocation,
                    distanceField: 'distance',
                    ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
                    spherical: true,
                    query: {
                        $and: [
                            statusFilter,
                            expiryQuery
                        ].filter(c => Object.keys(c).length > 0)
                    },
                },
            },
        ];

        // Add manual address filter if in manual mode
        if (mode === 'manual' && manualLocation?.city) {
            dataPipeline.push({
                $match: {
                    manualAddress: {
                        $regex: manualLocation.city,
                        $options: 'i'
                    }
                }
            });
            console.log(`Filtering by manual city: ${manualLocation.city}`);
        }

        // Add search filter
        if (search.trim()) {
            dataPipeline.push({
                $match: {
                    $or: [
                        { title: { $regex: search, $options: 'i' } },
                        { description: { $regex: search, $options: 'i' } },
                    ],
                },
            });
            console.log(`Search filter applied: ${search}`);
        }

        // Add pagination and projection
        dataPipeline.push(
            { $sort: { distance: 1 } },
            { $skip: skip },
            { $limit: Number(limit) },
            {
                $project: {
                    bannerImage: 1,
                    title: 1,
                    description: 1,
                    manualAddress: 1,
                    location: 1,
                    status: 1,
                    expiryAt: 1,
                    searchRadius: 1,
                    createdBy: 1,
                    ownerId: 1,
                    distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
                },
            }
        );

        // 8️⃣ Execute main query
        let data = await PromotionalBanner.aggregate(dataPipeline);
        console.log(`Initial query returned ${data.length} banners`);

        // 9️⃣ Fallback: Fetch all active non-expired banners if no results
        if (data.length === 0) {
            console.log('No banners found, falling back to all active non-expired banners');
            const fallbackPipeline = [
                {
                    $match: {
                        $and: [
                            statusFilter,
                            expiryQuery
                        ].filter(c => Object.keys(c).length > 0)
                    }
                },
            ];

            // Add manual address filter if in manual mode
            if (mode === 'manual' && manualLocation?.city) {
                fallbackPipeline.push({
                    $match: {
                        manualAddress: {
                            $regex: manualLocation.city,
                            $options: 'i'
                        }
                    }
                });
            }

            // Add search filter
            if (search.trim()) {
                fallbackPipeline.push({
                    $match: {
                        $or: [
                            { title: { $regex: search, $options: 'i' } },
                            { description: { $regex: search, $options: 'i' } },
                        ],
                    },
                });
            }

            // Add sorting and pagination
            fallbackPipeline.push(
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: Number(limit) },
                {
                    $project: {
                        bannerImage: 1,
                        title: 1,
                        description: 1,
                        manualAddress: 1,
                        location: 1,
                        status: 1,
                        expiryAt: 1,
                        searchRadius: 1,
                        createdBy: 1,
                        ownerId: 1,
                        distanceInKm: { $literal: null }, // No distance in fallback mode
                    },
                }
            );

            data = await PromotionalBanner.aggregate(fallbackPipeline);
            mode = 'fallback';
            console.log(`Fallback query returned ${data.length} banners`);
        }

        // 🔟 Count total matching banners
        const countPipeline = [
            {
                $geoNear: {
                    near: baseLocation,
                    distanceField: 'distance',
                    ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}),
                    spherical: true,
                    query: {
                        $and: [
                            statusFilter,
                            expiryQuery
                        ].filter(c => Object.keys(c).length > 0)
                    },
                },
            },
        ];

        // Add manual address filter if in manual mode
        if (mode === 'manual' && manualLocation?.city) {
            countPipeline.push({
                $match: {
                    manualAddress: {
                        $regex: manualLocation.city,
                        $options: 'i'
                    }
                }
            });
        }

        // Add search filter
        if (search.trim()) {
            countPipeline.push({
                $match: {
                    $or: [
                        { title: { $regex: search, $options: 'i' } },
                        { description: { $regex: search, $options: 'i' } },
                    ],
                },
            });
        }

        countPipeline.push({ $count: 'total' });
        let total = (await PromotionalBanner.aggregate(countPipeline))[0]?.total || 0;

        // Handle fallback count
        if (mode === 'fallback') {
            const fallbackCountPipeline = [
                {
                    $match: {
                        $and: [
                            statusFilter,
                            expiryQuery
                        ].filter(c => Object.keys(c).length > 0)
                    }
                },
            ];

            // Add manual address filter if in manual mode
            if (mode === 'manual' && manualLocation?.city) {
                fallbackCountPipeline.push({
                    $match: {
                        manualAddress: {
                            $regex: manualLocation.city,
                            $options: 'i'
                        }
                    }
                });
            }

            // Add search filter
            if (search.trim()) {
                fallbackCountPipeline.push({
                    $match: {
                        $or: [
                            { title: { $regex: search, $options: 'i' } },
                            { description: { $regex: search, $options: 'i' } },
                        ],
                    },
                });
            }

            fallbackCountPipeline.push({ $count: 'total' });
            total = (await PromotionalBanner.aggregate(fallbackCountPipeline))[0]?.total || 0;
        }

        // 11️⃣ Populate user references
        if (data.length > 0) {
            data = await PromotionalBanner.populate(data, [
                { path: 'createdBy', select: 'name email' },
                { path: 'ownerId', select: 'name email' }
            ]);
        }

        // 12️⃣ Send response
        res.json({
            success: true,
            mode,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
            data,
            filters: {
                search: search || null,
                radius: effectiveRadius || null,
                status: status,
            },
        });
    } catch (err) {
        console.error('Error fetching promotional banners:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching promotional banners',
            error: err.message,
        });
    }
};

export const getAllPromotionalBanners = async (req, res) => {
    try {
        const { manualAddress, from, to, search } = req.query;

        let filter = {};

        // Filter by manualAddress
        if (manualAddress) {
            filter.manualAddress = { $regex: manualAddress, $options: "i" };
        }

        // Filter by date range (createdAt)
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }

        // Keyword search in title or description
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
            ];
        }

        // Get banners sorted by latest first
        const banners = await PromotionalBanner.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            count: banners.length,
            data: banners,
        });
    } catch (error) {
        console.error("Error fetching banners:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch promotional banners",
            error: error.message,
        });
    }
};


// Update Banner
export const updatePromotionalBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const updatedBanner = await PromotionalBanner.findByIdAndUpdate(
            id,
            updates,
            { new: true, runValidators: true }
        );

        if (!updatedBanner) {
            return res.status(404).json({ success: false, message: "Banner not found" });
        }

        res.json({ success: true, message: "Banner updated successfully", data: updatedBanner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// Delete Banner
export const deletePromotionalBanner = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedBanner = await PromotionalBanner.findByIdAndDelete(id);

        if (!deletedBanner) {
            return res.status(404).json({ success: false, message: "Banner not found" });
        }

        res.json({ success: true, message: "Banner deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// Change Status (Activate / Deactivate)
export const toggleBannerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // "active" or "inactive"

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const banner = await PromotionalBanner.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!banner) {
            return res.status(404).json({ success: false, message: "Banner not found" });
        }

        res.json({ success: true, message: `Banner ${status} successfully`, data: banner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
