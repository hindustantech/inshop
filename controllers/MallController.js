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