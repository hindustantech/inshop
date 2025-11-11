export function buildMallAggregationPipeline(baseLocation, effectiveRadius, search, skip = 0, limit = 50, useFacet = true) {
    const MAX_RADIUS = 100000;
    const radius = effectiveRadius ? Math.min(effectiveRadius, MAX_RADIUS) : undefined;

    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const geoQuery = {
        active: true,
        ...(search.trim()
            ? {
                $or: [
                    { name: searchRegex },
                    { tagline: searchRegex },
                    { manul_address: searchRegex },
                    { "address.city": searchRegex },
                    { "address.area": searchRegex },
                    { "address.state": searchRegex },
                ],
            }
            : {}),
    };

    if (useFacet) {
        const pipeline = [
            { $geoNear: { near: baseLocation, distanceField: "distance", spherical: true, ...(radius ? { maxDistance: radius } : {}), query: geoQuery } },
            { $addFields: { distanceInKm: { $round: [{ $divide: ["$distance", 1000] }, 2] } } },
            { $sort: { distance: 1, createdAt: -1 } },
            {
                $facet: {
                    paginatedResults: [
                        { $skip: skip },
                        { $limit: limit },
                        { $project: { name: 1, tagline: 1, manul_address: 1, address: 1, logo: 1, rating: 1, facilities: 1, distanceInKm: 1 } }
                    ],
                    totalCount: [{ $count: "total" }]
                }
            }
        ];
        return { pipeline, geoQuery, useFacet: true };
    } else {
        const pipeline = [
            { $geoNear: { near: baseLocation, distanceField: "distance", spherical: true, ...(radius ? { maxDistance: radius } : {}), query: geoQuery } },
            { $addFields: { distanceInKm: { $round: [{ $divide: ["$distance", 1000] }, 2] } } },
            { $sort: { distance: 1, createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            { $project: { name: 1, tagline: 1, manul_address: 1, address: 1, logo: 1, rating: 1, facilities: 1, distanceInKm: 1 } }
        ];
        return { pipeline, geoQuery, useFacet: false };
    }
}
