import Mall from "../models/MallSchema.js";
import { parseAndValidateMallQuery } from "../services/queryParser.js";
import { locationFactory } from "../services/locationFactory.js";
import { buildMallAggregationPipeline } from "../services/pipelineBuilder.js";

import PatnerProfile from "../models/PatnerProfile.js";

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

        // Validate mallId
        if (!mallId) {
            return res.status(400).json({
                message: "Mall id not provided",
                success: false,
            });
        }

        const parsedPage = parseInt(page);
        const parsedLimit = parseInt(limit);
        if (isNaN(parsedPage) || parsedPage < 1) return res.status(400).json({ success: false, message: "Invalid page number" });
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) return res.status(400).json({ success: false, message: "Invalid limit" });

        const skip = (parsedPage - 1) * parsedLimit;

        // Build search query
        const query = { mallId };
        if (search.trim()) {
            const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.name = searchRegex; // assuming PatnerProfile has `name` field
        }

        // Fetch total count
        const total = await PatnerProfile.countDocuments(query);

        // Fetch paginated shops
        const shopunderthemall = await PatnerProfile.find(query)
            .skip(skip)
            .limit(parsedLimit)
            .sort({ createdAt: -1 }); // newest first, optional

        res.status(200).json({
            success: true,
            message: "Shops fetched successfully",
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
            message: "Something went wrong"
        });
    }
};



import validator from "validator"; // npm install validator

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

        // 4️⃣ Sanitize strings and defaults
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
            logo: data.logo || "",
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
            // 5️⃣ Update existing mall
            mall = await Mall.findByIdAndUpdate(mallId, mallData, { new: true });
            if (!mall) {
                return res.status(404).json({ success: false, message: "Mall not found to update" });
            }
            return res.status(200).json({ success: true, message: "Mall updated successfully", mall });
        } else {
            // 6️⃣ Create new mall
            mall = await Mall.create(mallData);
            return res.status(201).json({ success: true, message: "Mall created successfully", mall });
        }

    } catch (error) {
        console.error("Error in createOrUpdateMall:", error);
        res.status(500).json({ success: false, message: "Something went wrong", error: error.message });
    }
};
