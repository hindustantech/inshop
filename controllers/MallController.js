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

// ==========================

export const createOrUpdateMall = async (req, res) => {
  try {
    const data = req.body;
    const { mallId } = data;

    // 1️⃣ Required fields for creation
    if (!mallId && (!data.name || !data.name.trim())) {
      return res.status(400).json({ success: false, message: "Mall name is required" });
    }
    if (!mallId && (!data.manul_address || !data.manul_address.trim())) {
      return res.status(400).json({ success: false, message: "Manual address is required" });
    }

    // 2️⃣ Location validation
    if (data.location?.coordinates) {
      if (
        !Array.isArray(data.location.coordinates) ||
        data.location.coordinates.length !== 2 ||
        isNaN(data.location.coordinates[0]) ||
        isNaN(data.location.coordinates[1])
      ) {
        return res.status(400).json({ success: false, message: "Valid location coordinates [lng, lat] are required" });
      }
    }

    // 3️⃣ Contact validation
    if (data.contact?.email && !validator.isEmail(data.contact.email)) {
      return res.status(400).json({ success: false, message: "Invalid email address" });
    }
    if (data.contact?.phone && !validator.isMobilePhone(data.contact.phone, "any")) {
      return res.status(400).json({ success: false, message: "Invalid phone number" });
    }
    if (data.contact?.website && !validator.isURL(data.contact.website)) {
      return res.status(400).json({ success: false, message: "Invalid website URL" });
    }

    // -----------------------------
    // 4️⃣ IMAGE UPLOAD SECTION
    // -----------------------------

    let logoUrl = data.logo || "";        // default old logo
    let galleryUrls = [];                 // new gallery if uploaded

    // ⭐ Upload LOGO file
    if (req.files?.logo && req.files.logo[0]) {
      const logoBuffer = req.files.logo[0].buffer;
      const uploadedLogo = await uploadToCloudinary(logoBuffer, "mall/logo");
      logoUrl = uploadedLogo.secure_url;
    }

    // ⭐ Upload GALLERY images
    if (req.files?.gallery && req.files.gallery.length > 0) {
      for (const file of req.files.gallery) {
        const uploaded = await uploadToCloudinary(file.buffer, "mall/gallery");
        galleryUrls.push(uploaded.secure_url);
      }
    }

    // 5️⃣ Prepare sanitized data
    const mallData = {
      name: data.name?.trim(),
      tagline: data.tagline?.trim() || "",
      description: data.description?.trim() || "",
      manul_address: data.manul_address?.trim(),
      address: {
        street: data.address?.street?.trim() || "",
        area: data.address?.area?.trim() || "",
        city: data.address?.city?.trim() || "",
        state: data.address?.state?.trim() || "",
        country: data.address?.country?.trim() || "India",
        pincode: data.address?.pincode?.trim() || "",
      },
      location: data.location
        ? { type: "Point", coordinates: data.location.coordinates.map(Number) }
        : undefined,

      logo: logoUrl,                   // 🔥 NEW — Updated Logo URL
      gallery: galleryUrls.length > 0 ? galleryUrls : undefined, // 🔥 NEW Gallery images

      facilities: {
        parking: data.facilities?.parking || false,
        foodCourt: data.facilities?.foodCourt || false,
        kidsZone: data.facilities?.kidsZone || false,
        wheelchairAccess: data.facilities?.wheelchairAccess || false,
        cinema: data.facilities?.cinema || false,
        restrooms: data.facilities?.restrooms !== undefined ? data.facilities.restrooms : true,
        atm: data.facilities?.atm !== undefined ? data.facilities.atm : true,
        wifi: data.facilities?.wifi || false,
      },
      timings: {
        open: data.timings?.open || "10:00 AM",
        close: data.timings?.close || "10:00 PM",
        closedOn: data.timings?.closedOn || "None",
      },
      active: data.active !== undefined ? data.active : true,
    };

    let mall;

    if (mallId) {
      // 6️⃣ Update mall
      mall = await Mall.findByIdAndUpdate(mallId, mallData, { new: true });
      if (!mall) {
        return res.status(404).json({ success: false, message: "Mall not found to update" });
      }
      return res.status(200).json({ success: true, message: "Mall updated successfully", mall });
    } else {
      // 7️⃣ Create mall
      mall = await Mall.create(mallData);
      return res.status(201).json({ success: true, message: "Mall created successfully", mall });
    }

  } catch (error) {
    console.error("Error in createOrUpdateMall:", error);
    res.status(500).json({ success: false, message: "Something went wrong", error: error.message });
  }
};



export const addintomall = async (req, res) => {
    const UserId = req.user.id;
    const { mallId } = req.body;

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

