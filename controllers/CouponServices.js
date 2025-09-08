import Coupon from '../models/coupunModel.js';
import UserCoupon from '../models/UserCoupon.js';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/userModel.js';

class CouponService {


    static async createCoupon(data) {
    try {
        // Required fields check based on schema
        const requiredFields = ['title', 'coupon_srno', 'category', 'discountPercentage', 'ownerId', 'validTill', 'termsAndConditions', 'tag'];
        for (let field of requiredFields) {
            if (!data[field]) throw new Error(`${field} is required`);
        }

        // Check for required shope_location fields
        if (!data.shope_location || !data.shope_location.type || !data.shope_location.coordinates) {
            throw new Error('shope_location is required with type and coordinates [longitude, latitude]');
        }

        // Validate coordinates length
        if (!Array.isArray(data.shope_location.coordinates) || data.shope_location.coordinates.length !== 2) {
            throw new Error('Coordinates must be an array of [longitude, latitude]');
        }

        const coupon = new Coupon({
            title: data.title,
            coupon_image: data.coupon_image || [], // Fixed typo from 'copuon_image'
            coupon_srno: data.coupon_srno, // Fixed typo from 'copuon_srno'
            category: data.category,
            coupon_type: data.coupon_type || false, // Fixed typo from 'copuon_type'
            isTransferable: data.isTransferable || false, // Explicitly set as per schema
            discountPercentage: data.discountPercentage,
            ownerId: data.ownerId,
            validTill: data.validTill,
            creationDate: new Date(), // Set default as per schema
            style: data.style || {}, // Optional as per schema
            active: data.active !== undefined ? data.active : true, // Default true as per schema
            maxDistributions: data.maxDistributions || 0, // Default 0 as per schema
            currentDistributions: 0, // Default 0 as per schema
            isFullDay: data.isFullDay || false, // Default false as per schema
            fromTime: data.isFullDay ? null : data.fromTime, // Conditional as per schema
            toTime: data.isFullDay ? null : data.toTime, // Conditional as per schema
            shope_location: { // Fixed typo from 'copuon_srno' - now properly set
                type: data.shope_location.type || 'Point', // Default to "Point" as per schema
                coordinates: data.shope_location.coordinates // Already validated
            },
            termsAndConditions: data.termsAndConditions,
            is_spacial_copun: data.is_spacial_copun || false, // Fixed typo, default false as per schema
            tag: data.tag,
            consumersId: data.consumersId || [] // Default empty array as per schema
        });

        await coupon.save();
        return coupon;
    } catch (error) {
        throw new Error(`Coupon creation failed: ${error.message}`);
    }
}

  static async getNearbyCoupons({ userId, page = 1, limit = 10, search = '', maxRadiusKm = 100 }) {
    try {
        // Fetch user's latest location
        const user = await User.findById(userId).select('latestLocation');
        if (!user || !user.latestLocation || !user.latestLocation.coordinates || user.latestLocation.coordinates.length !== 2) {
            throw new Error('User location not found or invalid');
        }

        const userLocation = user.latestLocation;
        const maxDistanceMeters = maxRadiusKm * 1000; // Convert km to meters

        // Base query for available coupons: active, valid till future date
        let baseQuery = {
            active: true,
            validTill: { $gt: new Date() },
            // Assuming if maxDistributions > 0, check currentDistributions < maxDistributions for availability
            $or: [
                { maxDistributions: 0 }, // Unlimited if 0
                { $expr: { $lt: ['$currentDistributions', '$maxDistributions'] } }
            ]
        };

        // If search provided, add to query
        let searchQuery = {};
        if (search) {
            searchQuery = {
                $or: [
                    { title: { $regex: search, $options: 'i' } },
                    { coupon_srno: { $regex: search, $options: 'i' } },
                    { category: { $in: [new RegExp(search, 'i')] } },
                    { tag: { $in: [new RegExp(search, 'i')] } }
                ]
            };
        }

        // Aggregation pipeline
        const pipeline = [
            // First match to filter available coupons
            { $match: { ...baseQuery, ...searchQuery } },
            // GeoNear to find nearby and calculate distance
            {
                $geoNear: {
                    near: userLocation,
                    distanceField: 'distance',
                    distanceMultiplier: 0.001, // Convert meters to km
                    maxDistance: maxDistanceMeters,
                    spherical: true,
                    key: 'shope_location'
                }
            },
            // Lookup to join with UserCoupon to check coupon status for the user
            {
                $lookup: {
                    from: 'usercoupons', // Collection name for UserCoupon model
                    let: { couponId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$couponId', '$$couponId'] },
                                        { $eq: ['$userId', new mongoose.Types.ObjectId(userId)] }
                                    ]
                                }
                            }
                        },
                        { $project: { status: 1, transferredTo: 1 } }
                    ],
                    as: 'userCouponStatus'
                }
            },
            // Add field to determine availability for user
            {
                $addFields: {
                    userCouponStatus: { $arrayElemAt: ['$userCouponStatus', 0] },
                    isAvailableForUser: {
                        $cond: {
                            if: {
                                $or: [
                                    { $eq: [{ $ifNull: ['$userCouponStatus', null] }, null] }, // No UserCoupon record
                                    { $eq: ['$userCouponStatus.status', 'available'] } // Explicitly available
                                ]
                            },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            // Filter to only include coupons available for the user
            { $match: { isAvailableForUser: true } },
            // Sort by distance ascending (nearest first)
            { $sort: { distance: 1 } },
            // Pagination
            { $skip: (page - 1) * limit },
            { $limit: limit },
            // Project to shape output
            {
                $project: {
                    distance: { $round: ['$distance', 2] }, // Round to 2 decimal places
                    _id: 1,
                    title: 1,
                    coupon_image: 1,
                    coupon_srno: 1,
                    category: 1,
                    coupon_type: 1,
                    isTransferable: 1,
                    discountPercentage: 1,
                    ownerId: 1,
                    validTill: 1,
                    creationDate: 1,
                    style: 1,
                    active: 1,
                    maxDistributions: 1,
                    currentDistributions: 1,
                    isFullDay: 1,
                    fromTime: 1,
                    toTime: 1,
                    shope_location: 1,
                    termsAndConditions: 1,
                    is_spacial_copun: 1,
                    tag: 1,
                    consumersId: 1,
                    userCouponStatus: 1, // Include status for reference
                    isAvailableForUser: 1
                }
            }
        ];

        const coupons = await Coupon.aggregate(pipeline);

        // Count total available coupons within radius
        const countPipeline = [
            { $match: { ...baseQuery, ...searchQuery } },
            {
                $geoNear: {
                    near: userLocation,
                    distanceField: 'distance',
                    distanceMultiplier: 0.001,
                    maxDistance: maxDistanceMeters,
                    spherical: true,
                    key: 'shope_location'
                }
            },
            {
                $lookup: {
                    from: 'usercoupons',
                    let: { couponId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$couponId', '$$couponId'] },
                                        { $eq: ['$userId', new mongoose.Types.ObjectId(userId)] }
                                    ]
                                }
                            }
                        },
                        { $project: { status: 1 } }
                    ],
                    as: 'userCouponStatus'
                }
            },
            {
                $addFields: {
                    userCouponStatus: { $arrayElemAt: ['$userCouponStatus', 0] },
                    isAvailableForUser: {
                        $cond: {
                            if: {
                                $or: [
                                    { $eq: [{ $ifNull: ['$userCouponStatus', null] }, null] },
                                    { $eq: ['$userCouponStatus.status', 'available'] }
                                ]
                            },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $match: { isAvailableForUser: true } },
            { $count: 'total' }
        ];
        const countResult = await Coupon.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        return {
            coupons,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                limit,
                maxRadiusKm
            },
            userLocation: userLocation.coordinates
        };
    } catch (error) {
        throw new Error(`Failed to fetch nearby coupons: ${error.message}`);
    }
}
    // Other existing methods (claimCoupon, scanCoupon, cancelCoupon, transferCoupon) remain unchanged
    static async claimCoupon(couponId, userId) {
        const coupon = await Coupon.findById(couponId);
        if (!coupon.active) throw new Error("Coupon inactive");

        if (coupon.maxDistributions && coupon.currentDistributions >= coupon.maxDistributions) {
            throw new Error("Coupon distribution limit reached");
        }

        if (coupon.is_spacial_copun && !coupon.consumersId.includes(userId)) {
            throw new Error("Not eligible for special coupon");
        }

        const qrCode = uuidv4();
        const userCoupon = new UserCoupon({ couponId, userId, qrCode });
        await userCoupon.save();

        coupon.currentDistributions += 1;
        await coupon.save();

        return userCoupon;
    }

    static async scanCoupon(qrCode, userId) {
        const userCoupon = await UserCoupon.findOne({ qrCode }).populate('couponId');
        if (!userCoupon) throw new Error("Coupon not found");

        const coupon = userCoupon.couponId;
        const now = new Date();

        if (!coupon.active) throw new Error("Coupon inactive");
        if (userCoupon.status === 'used') throw new Error("Coupon already used");
        if (userCoupon.status === 'cancelled') throw new Error("Coupon cancelled");
        if (coupon.is_spacial_copun && !coupon.consumersId.includes(userId)) {
            throw new Error("Not eligible for special coupon");
        }

        userCoupon.status = 'used';
        userCoupon.qrScanDate = now;
        await userCoupon.save();

        return userCoupon;
    }

    static async cancelCoupon(userCouponId, userId) {
        const userCoupon = await UserCoupon.findById(userCouponId);
        if (!userCoupon) throw new Error("Coupon not found");

        const now = new Date();
        const diffMinutes = (now - new Date(userCoupon.qrScanDate)) / (1000 * 60);

        if (diffMinutes > 20) throw new Error("Cancellation time expired");

        userCoupon.status = 'available';
        userCoupon.qrScanDate = null;
        await userCoupon.save();

        return userCoupon;
    }

    static async transferCoupon(userCouponId, fromUserId, toUserId) {
        const userCoupon = await UserCoupon.findById(userCouponId).populate('couponId');
        if (!userCoupon) throw new Error("Coupon not found");
        if (!userCoupon.couponId.isTransferable) throw new Error("Coupon not transferable");
        if (userCoupon.userId.toString() !== fromUserId) throw new Error("Not authorized");

        userCoupon.status = 'transferred';
        userCoupon.transferredTo = toUserId;
        userCoupon.transferDate = new Date();
        await userCoupon.save();

        const newUserCoupon = new UserCoupon({
            couponId: userCoupon.couponId._id,
            userId: toUserId,
            qrCode: uuidv4()
        });
        await newUserCoupon.save();

        return newUserCoupon;
    }



    static async getAllCoupons({ page = 1, limit = 10, search = '' }) {
        try {
            const query = search
                ? {
                    $or: [
                        { title: { $regex: search, $options: 'i' } },
                        { coupon_srno: { $regex: search, $options: 'i' } },
                        { category: { $in: [new RegExp(search, 'i')] } },
                        { tag: { $in: [new RegExp(search, 'i')] } }
                    ]
                }
                : {};

            const coupons = await Coupon.find(query)
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();

            const total = await Coupon.countDocuments(query);

            return {
                coupons,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    limit
                }
            };
        } catch (error) {
            throw new Error(`Failed to fetch coupons: ${error.message}`);
        }
    }

}

export default CouponService;