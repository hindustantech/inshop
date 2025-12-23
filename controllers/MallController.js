// controllers/MallController.js
import Mall from "../models/MallSchema.js";
import PatnerProfile from "../models/PatnerProfile.js";
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
        // 1️⃣ Parse query
        const { parsedPage, parsedLimit, parsedRadius, search, skip } = parseAndValidateMallQuery(req.query);

        // 2️⃣ Get base location
        const baseLocationData = await locationFactory.getBaseLocation(req, parsedRadius);
        if (!baseLocationData) return res.status(400).json({ success: false, message: "Unable to determine base location" });
        const { location: baseLocation, mode, effectiveRadius } = baseLocationData;

        // 3️⃣ Build pipeline with $facet
        const { pipeline, geoQuery, useFacet } = buildMallAggregationPipeline(baseLocation, effectiveRadius, search, skip, parsedLimit, true);

        // 4️⃣ Execute aggregation
        const result = await Mall.aggregate(pipeline);

        let malls = [];
        let total = 0;

        if (useFacet) {
            malls = result[0]?.paginatedResults || [];
            total = result[0]?.totalCount[0]?.total || 0;
        } else {
            malls = result;
            const totalResult = await Mall.aggregate([{ $geoNear: { near: baseLocation, distanceField: "distance", spherical: true, ...(effectiveRadius ? { maxDistance: effectiveRadius } : {}), query: geoQuery } }, { $count: "total" }]);
            total = totalResult[0]?.total || 0;
        }

        res.status(200).json({
            success: true,
            mode,
            page: parsedPage,
            limit: parsedLimit,
            total,
            pages: total ? Math.ceil(total / parsedLimit) : 0,
            data: malls
        });

    } catch (error) {
        console.error("Error fetching malls with user location:", error);
        res.status(500).json({ success: false, message: error.message });
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
    const { mallId, UserId } = req.body;

    try {
        // 1️⃣ Find the shop for the current user
        const shop = await PatnerProfile.findOne({ User_id: UserId });
        if (!shop) return res.status(404).json({ message: "Shop not found" });

        // 2️⃣ Update the shop to set its mallId
        shop.mallId = mallId;
        shop.isIndependent = false; // now it's linked to a mall
        await shop.save();

        // 3️⃣ Add the shop to the mall's shops array
        const mall = await Mall.findByIdAndUpdate(
            mallId,
            { $addToSet: { shops: shop._id } }, // $addToSet avoids duplicates
            { new: true }
        );
        if (!mall) return res.status(404).json({ message: "Mall not found" });

        res.status(200).json({ message: "Shop successfully added to mall", mall });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
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