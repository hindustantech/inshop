import Ad from "../models/ads.js";
import mongoose from "mongoose";
import User from "../models/userModel.js";
import Coupon from "../models/coupunModel.js";
import Banner from "../models/Banner.js";
import ManualAddress from "../models/ManualAddress.js";
import UserCoupon from '../models/UserCoupon.js';
import Salses from '../models/Sales.js'

// 1️⃣ Create a new Ad
export const createAd = async (req, res) => {
  try {
    const { name, desc } = req.body;

    if (!name || !desc) {
      return res.status(400).json({ success: false, message: "Name and Description are required" });
    }

    const newAd = new Ad({ name, desc });
    await newAd.save();

    res.status(201).json({ success: true, message: "Ad created successfully", data: newAd });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 2️⃣ Get all Ads
export const getAllAds = async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 }); // Latest first
    res.status(200).json({ success: true, data: ads });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 3️⃣ Update an Ad by ID
export const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, desc } = req.body;

    const updatedAd = await Ad.findByIdAndUpdate(
      id,
      { name, desc },
      { new: true, runValidators: true } // new: updated document return karega
    );

    if (!updatedAd) {
      return res.status(404).json({ success: false, message: "Ad not found" });
    }

    res.status(200).json({ success: true, message: "Ad updated successfully", data: updatedAd });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getBannersByLocation = async (req, res) => {
  try {
    const { location, promotion } = req.query;
    const userId = req.user?.id;

    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location parameter is required'
      });
    }

    const manualAddress = await ManualAddress.findOne({
      uniqueCode: location,
      isActive: true
    });

    if (!manualAddress) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    let userLocation = location;

    if (userId) {
      const user = await User.findById(userId);
      if (user && user.manul_address) {
        const userManualAddress = await ManualAddress.findOne({
          uniqueCode: user.manul_address,
          isActive: true
        });

        if (userManualAddress) {
          userLocation = user.manul_address;
        }
      }
    }

    // Build aggregation pipeline
    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: manualAddress.location.coordinates
          },
          distanceField: "distance",
          distanceMultiplier: 0.001, // Convert meters to kilometers
          spherical: true,
          query: {
            manual_address: userLocation,
            expiryAt: { $gte: new Date() }
          }
        }
      },
      {
        $lookup: {
          from: "ads",
          localField: "promotion",
          foreignField: "_id",
          as: "promotion"
        }
      },
      {
        $unwind: {
          path: "$promotion",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          distance: 1,
          distanceInMeters: { $multiply: ["$distance", 1000] }, // Convert back to meters for sorting
          "promotion.name": 1,
          "promotion.desc": 1,
          // Include all other banner fields you need
          manual_address: 1,
          banner_image: 1,
          banner_type: 1,
          title: 1,
          expiryAt: 1,
          createdAt: 1
        }
      },
      {
        $sort: { distance: 1 } // Sort by distance (closest first)
      },
      {
        $limit: 20
      }
    ];

    // Add promotion filter if provided
    if (promotion) {
      pipeline[0].$geoNear.query.promotion = {
        $in: [new mongoose.Types.ObjectId(promotion)]
      };
    }

    const banners = await Banner.aggregate(pipeline);

    // Format the distance for display
    const bannersWithFormattedDistance = banners.map(banner => ({
      ...banner,
      distance: `${banner.distance.toFixed(2)} km`,
      distanceInMeters: Math.round(banner.distance * 1000)
    }));

    res.status(200).json({
      success: true,
      location: {
        code: userLocation,
        city: manualAddress.city
      },
      banners: bannersWithFormattedDistance,
      totalCount: bannersWithFormattedDistance.length,
      promotionFilter: promotion || 'all'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


export const getAdUserCityByCopunWithGeo = async (req, res) => {
  try {
    // 1️⃣ Validate user ID
    let userId = null;
    if (req.user?.id && mongoose.isValidObjectId(req.user.id)) {
      userId = new mongoose.Types.ObjectId(req.user.id);
    }

    // 2️⃣ Parse and validate query parameters
    const {
      radius = 100000,
      search = '',
      page = 1,
      limit = 50,
      manualCode,
      lat,
      lng,
      promotion,
    } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const parsedRadius = parseInt(radius);

    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ success: false, message: 'Invalid page number' });
    }

    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ success: false, message: 'Invalid limit, must be between 1 and 100' });
    }

    if (
      (lat && (isNaN(Number(lat)) || Number(lat) < -90 || Number(lat) > 90)) ||
      (lng && (isNaN(Number(lng)) || Number(lng) < -180 || Number(lng) > 180))
    ) {
      return res.status(400).json({ success: false, message: 'Invalid latitude (-90 to 90) or longitude (-180 to 180)' });
    }

    if (isNaN(parsedRadius) || parsedRadius < 0) {
      return res.status(400).json({ success: false, message: 'Invalid radius' });
    }

    // 3️⃣ Validate promotion IDs
    let promotionIds = [];
    if (promotion) {
      promotionIds = Array.isArray(promotion) ? promotion : [promotion];
      const invalidIds = promotionIds.filter((id) => !mongoose.isValidObjectId(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid promotion ID(s): ${invalidIds.join(', ')}`,
        });
      }

      const ads = await Ad.find({ _id: { $in: promotionIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select('_id')
        .lean();
      if (ads.length !== promotionIds.length) {
        return res.status(400).json({
          success: false,
          message: `One or more promotion IDs not found`,
        });
      }
    }

    // 4️⃣ Determine base location and mode
    let baseLocation = null;
    let mode = userId ? 'user' : 'guest';
    let sortByLatest = false;

    // Logged-in user location
    if (userId) {
      const user = await User.findById(userId).select('latestLocation').lean();
      if (user?.latestLocation?.coordinates?.length === 2) {
        const [userLng, userLat] = user.latestLocation.coordinates;
        baseLocation = { type: 'Point', coordinates: [userLng, userLat] };
      }
    }

    // Manual location
    if (manualCode) {
      const manualLocation = await ManualAddress.findOne({ uniqueCode: manualCode, isActive: true })
        .select('location')
        .lean();
      if (manualLocation?.location?.coordinates) {
        baseLocation = manualLocation.location;
        mode = 'manual';
      } else {
        return res.status(400).json({ success: false, message: 'Invalid or inactive manual code' });
      }
    }

    // Query-based custom location
    if (lat && lng) {
      baseLocation = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
      mode = 'custom';
    }

    // Default fallback (center of India)
    if (!baseLocation) {
      baseLocation = { type: 'Point', coordinates: [78.9629, 20.5937] };
      mode = 'default';
      sortByLatest = true;
    }

    // 5️⃣ Build search regex with sanitization
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');

    // 6️⃣ Build geo query with promotion as array
    const geoQuery = {
      active: true,
      ...(promotionIds.length > 0
        ? { promotion: { $in: promotionIds.map((id) => new mongoose.Types.ObjectId(id)) } }
        : {}),
    };

    // 7️⃣ Build aggregation pipeline with $facet for data and count
    const pipeline = [
      {
        $geoNear: {
          near: baseLocation,
          distanceField: 'distance',
          maxDistance: parsedRadius,
          spherical: true, 
          key: 'shope_location', // Fixed typo: shope_location -> shop_location
          query: geoQuery,
        },
      },
      ...(search.trim()
        ? [
            {
              $match: {
                $or: [
                  { manual_address: searchRegex },
                  { title: searchRegex },
                  { tag: { $elemMatch: { $regex: searchRegex } } },
                ],
              },
            },
          ]
        : []),
      ...(userId
        ? [
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
                          { $eq: ['$userId', userId] },
                        ],
                      },
                    },
                  },
                  { $project: { status: 1, _id: 0 } },
                ],
                as: 'userStatus',
              },
            },
            { $unwind: { path: '$userStatus', preserveNullAndEmptyArrays: true } },
            {
              $match: {
                active: true,
                $or: [
                  { validTill: { $gt: new Date() } },
                  { validTill: null },
                ],
                $or: [
                  { userStatus: { $exists: false } },
                  { 'userStatus.status': { $nin: ['used', 'transferred'] } },
                ],
              },
            },
            {
              $addFields: {
                displayTag: {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$userStatus.status', 'available'] }, then: 'Available' },
                      { case: { $eq: ['$userStatus.status', 'cancelled'] }, then: 'Cancelled' },
                    ],
                    default: 'Available',
                  },
                },
              },
            },
          ]
        : [
            {
              $match: {
                active: true,
                $or: [
                  { validTill: { $gt: new Date() } },
                  { validTill: null },
                ],
              },
            },
            {
              $addFields: {
                displayTag: { $ifNull: [{ $arrayElemAt: ['$tag', 0] }, 'Available'] },
              },
            },
          ]),
      {
        $facet: {
          data: [
            {
              $project: {
                title: 1,
                shop_name: 1,
                coupon_image: 1,
                manual_address: 1,
                coupon_srno: 1,
                coupon_color: 1,
                discountPercentage: 1,
                validTill: 1,
                displayTag: 1,
                distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] },
              },
            },
            { $sort: sortByLatest ? { validTill: -1, createdAt: -1 } : { distance: 1, validTill: -1 } },
            { $skip: (parsedPage - 1) * parsedLimit },
            { $limit: parsedLimit },
          ],
          count: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await Coupon.aggregate(pipeline);
    const coupons = result.data || [];
    const total = result.count[0]?.total || 0;

    // 8️⃣ Return response
    res.status(200).json({
      success: true,
      mode,
      data: coupons,
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
      promotionFilter: promotionIds.length > 0 ? promotionIds : 'all',
    });
  } catch (error) {
    console.error('Error fetching coupons:', error.message);
    const status = error.name === 'ValidationError' ? 400 : 500;
    const message = error.name === 'ValidationError' ? error.message : 'Internal server error';
    res.status(status).json({ success: false, message });
  }
};
// export const getAdUserCityByCopunWithGeo = async (req, res) => {
//   try {
//     const { location, promotion } = req.query;
//     const userId = req?.user?.id;

//     if (!location) {
//       return res.status(400).json({
//         success: false,
//         message: 'Location parameter is required'
//       });
//     }

//     const manualAddress = await ManualAddress.findOne({
//       uniqueCode: location,
//       isActive: true
//     });

//     if (!manualAddress) {
//       return res.status(404).json({
//         success: false,
//         message: 'Location not found'
//       });
//     }

//     let userLocation = location;
//     let targetCoordinates = manualAddress.location.coordinates;

//     // For logged-in users, check if they have a preferred manual address
//     if (userId) {
//       const user = await User.findById(userId);
//       if (user && user.manul_address) {
//         const userManualAddress = await ManualAddress.findOne({
//           uniqueCode: user.manul_address,
//           isActive: true
//         });

//         if (userManualAddress) {
//           userLocation = user.manul_address;
//           targetCoordinates = userManualAddress.location.coordinates;
//         }
//       }
//     }

//     // Build aggregation pipeline for coupons
//     const pipeline = [
//       {
//         $geoNear: {
//           near: {
//             type: "Point",
//             coordinates: targetCoordinates
//           },
//           distanceField: "distance",
//           distanceMultiplier: 0.001, // Convert meters to kilometers
//           spherical: true,
//           query: {
//             active: true,
//             validTill: { $gte: new Date() }
//           }
//         }
//       },
//       {
//         $lookup: {
//           from: "ads",
//           localField: "promotion",
//           foreignField: "_id",
//           as: "promotion"
//         }
//       },
//       {
//         $unwind: {
//           path: "$promotion",
//           preserveNullAndEmptyArrays: true
//         }
//       },
//       {
//         $project: {
//           distance: 1,
//           shop_name: 1,
//           distanceInMeters: { $multiply: ["$distance", 1000] },
//           "promotion.name": 1,
//           "promotion.desc": 1,
//           // Include all other coupon fields you need
//           title: 1,
//           copuon_image: 1,
//           manul_address: 1,
//           discountPercentage: 1,
//           validTill: 1,
//           coupon_color: 1,
//           creationDate: 1,
//           active: 1,
//           termsAndConditions: 1
//         }
//       },
//       {
//         $sort: { distance: 1 } // Sort by distance (closest first)
//       },
//       {
//         $limit: 50
//       }
//     ];

//     // Add promotion filter if provided
//     if (promotion) {
//       pipeline[0].$geoNear.query.promotion = {
//         $in: [new mongoose.Types.ObjectId(promotion)]
//       };
//     }

//     const coupons = await Coupon.aggregate(pipeline);

//     // Format the distance for display
//     const couponsWithFormattedDistance = coupons.map(coupon => ({
//       ...coupon,
//       distance: `${coupon.distance.toFixed(2)} km`,
//       distanceInMeters: Math.round(coupon.distance * 1000)
//     }));

//     res.status(200).json({
//       success: true,
//       location: {
//         code: userLocation,
//         city: manualAddress.city,
//         coordinates: targetCoordinates
//       },
//       coupons: couponsWithFormattedDistance,
//       totalCount: couponsWithFormattedDistance.length,
//       promotionFilter: promotion || 'all',
//       userStatus: userId ? 'logged-in' : 'guest'
//     });

//   } catch (error) {
//     console.error('Error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

export const addOrUpdateAds = async (req, res) => {
  try {
    const { couponId, bannerId, adIds } = req.body;
    const userId = req.user?.id;
    const userType = req.user?.type;

    // 1️⃣ Parse adIds if it's a string (common with multipart/form-data)
    let parsedAdIds = adIds;
    if (typeof adIds === 'string') {
      try {
        parsedAdIds = JSON.parse(adIds);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Invalid adIds JSON format'
        });
      }
    }

    // 2️⃣ Validate adIds array
    if (!Array.isArray(parsedAdIds) || parsedAdIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'adIds must be a non-empty array'
      });
    }

    // 3️⃣ Validate each adId as ObjectId
    const validAdIds = parsedAdIds.map(adId => {
      if (typeof adId !== 'string') adId = adId.toString();
      const trimmedId = adId.trim();
      if (!mongoose.Types.ObjectId.isValid(trimmedId)) {
        throw new Error(`Invalid adId: ${adId}`);
      }
      return new mongoose.Types.ObjectId(trimmedId);
    });

    // 4️⃣ Validate couponId / bannerId
    if (!couponId && !bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Either couponId or bannerId is required'
      });
    }

    if (couponId && bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Provide either couponId or bannerId, not both'
      });
    }

    let result;
    let updatedDocument;

    // 5️⃣ Handle coupon update
    if (couponId) {
      const coupon = await Coupon.findById(couponId);
      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Coupon not found' });
      }

      // Permission check
      if (
        userType !== 'super_admin' &&
        coupon.createdby.toString() !== userId &&
        coupon.ownerId.toString() !== userId
      ) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this coupon'
        });
      }

      updatedDocument = await Coupon.findByIdAndUpdate(
        couponId,
        { $set: { promotion: validAdIds } },
        { new: true, runValidators: true }
      ).populate('promotion', 'name desc');

      result = { type: 'coupon', document: updatedDocument };

    } else if (bannerId) {
      // 6️⃣ Handle banner update
      const banner = await Banner.findById(bannerId);
      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner not found' });
      }

      // Permission check
      if (
        userType !== 'super_admin' &&
        banner.createdby.toString() !== userId &&
        banner.ownerId.toString() !== userId
      ) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this banner'
        });
      }

      updatedDocument = await Banner.findByIdAndUpdate(
        bannerId,
        { $set: { promotion: validAdIds } },
        { new: true, runValidators: true }
      ).populate('promotion', 'name desc');

      result = { type: 'banner', document: updatedDocument };
    }

    // 7️⃣ Response
    res.status(200).json({
      success: true,
      message: `Ads successfully ${result.type === 'coupon' ? 'added to coupon' : 'added to banner'}`,
      data: result,
      updatedBy: userType === 'super_admin' ? 'super_admin' : 'owner'
    });

  } catch (error) {
    console.error('Error adding/updating ads:', error);

    if (error.message.includes('Invalid adId')) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(500).json({ success: false, message: 'Server error while updating ads' });
  }
};

export const appendAds = async (req, res) => {
  try {
    const { couponId, bannerId, adIds } = req.body;
    const userId = req.user?.id;
    const userType = req.user?.type;

    // Validate input
    if (!adIds || !Array.isArray(adIds) || adIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'adIds array is required and must not be empty'
      });
    }

    if (!couponId && !bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Either couponId or bannerId is required'
      });
    }

    // Validate that all adIds are valid ObjectIds
    const validAdIds = adIds.map(adId => {
      try {
        return new mongoose.Types.ObjectId(adId);
      } catch (error) {
        throw new Error(`Invalid adId: ${adId}`);
      }
    });

    let result;
    let updatedDocument;

    if (couponId) {
      // Check coupon existence
      const coupon = await Coupon.findById(couponId);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      // Super admin can bypass ownership check
      if (userType !== 'super_admin' &&
        coupon.createdby.toString() !== userId &&
        coupon.ownerId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this coupon'
        });
      }

      // Append ads to existing ones (avoid duplicates)
      updatedDocument = await Coupon.findByIdAndUpdate(
        couponId,
        {
          $addToSet: { promotion: { $each: validAdIds } }
        },
        {
          new: true,
          runValidators: true
        }
      ).populate('promotion', 'name desc');

      result = {
        type: 'coupon',
        document: updatedDocument
      };

    } else if (bannerId) {
      // Check banner existence
      const banner = await Banner.findById(bannerId);
      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Banner not found'
        });
      }

      // Super admin can bypass ownership check
      if (userType !== 'super_admin' &&
        banner.createdby.toString() !== userId &&
        banner.ownerId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this banner'
        });
      }

      // Append ads to existing ones (avoid duplicates)
      updatedDocument = await Banner.findByIdAndUpdate(
        bannerId,
        {
          $addToSet: { promotion: { $each: validAdIds } }
        },
        {
          new: true,
          runValidators: true
        }
      ).populate('promotion', 'name desc');

      result = {
        type: 'banner',
        document: updatedDocument
      };
    }

    res.status(200).json({
      success: true,
      message: `Ads successfully appended to ${result.type}`,
      data: result,
      addedCount: validAdIds.length,
      updatedBy: userType === 'super_admin' ? 'super_admin' : 'owner'
    });

  } catch (error) {
    console.error('Error appending ads:', error);

    if (error.message.includes('Invalid adId')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while appending ads'
    });
  }
};

export const removeAds = async (req, res) => {
  try {
    const { couponId, bannerId, adIds } = req.body;
    const userId = req.user?.id;
    const userType = req.user?.type;

    // Validate input
    if (!adIds || !Array.isArray(adIds) || adIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'adIds array is required and must not be empty'
      });
    }

    if (!couponId && !bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Either couponId or bannerId is required'
      });
    }

    // Validate that all adIds are valid ObjectIds
    const validAdIds = adIds.map(adId => {
      try {
        return new mongoose.Types.ObjectId(adId);
      } catch (error) {
        throw new Error(`Invalid adId: ${adId}`);
      }
    });

    let result;
    let updatedDocument;

    if (couponId) {
      // Check coupon existence
      const coupon = await Coupon.findById(couponId);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      // Super admin can bypass ownership check
      if (userType !== 'super_admin' &&
        coupon.createdby.toString() !== userId &&
        coupon.ownerId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this coupon'
        });
      }

      // Remove specific ads
      updatedDocument = await Coupon.findByIdAndUpdate(
        couponId,
        {
          $pull: { promotion: { $in: validAdIds } }
        },
        {
          new: true,
          runValidators: true
        }
      ).populate('promotion', 'name desc');

      result = {
        type: 'coupon',
        document: updatedDocument
      };

    } else if (bannerId) {
      // Check banner existence
      const banner = await Banner.findById(bannerId);
      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Banner not found'
        });
      }

      // Super admin can bypass ownership check
      if (userType !== 'super_admin' &&
        banner.createdby.toString() !== userId &&
        banner.ownerId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this banner'
        });
      }

      // Remove specific ads
      updatedDocument = await Banner.findByIdAndUpdate(
        bannerId,
        {
          $pull: { promotion: { $in: validAdIds } }
        },
        {
          new: true,
          runValidators: true
        }
      ).populate('promotion', 'name desc');

      result = {
        type: 'banner',
        document: updatedDocument
      };
    }

    res.status(200).json({
      success: true,
      message: `Ads successfully removed from ${result.type}`,
      data: result,
      removedCount: validAdIds.length,
      updatedBy: userType === 'super_admin' ? 'super_admin' : 'owner'
    });

  } catch (error) {
    console.error('Error removing ads:', error);

    if (error.message.includes('Invalid adId')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while removing ads'
    });
  }
};

// Additional function for super admin to manage multiple coupons/banners at once
export const bulkUpdateAds = async (req, res) => {
  try {
    const { couponIds, bannerIds, adIds, action } = req.body; // action: 'add', 'remove', 'replace'
    const userType = req.user?.type;

    // Only super admin can perform bulk operations
    if (userType !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can perform bulk operations'
      });
    }

    // Validate input
    if (!adIds || !Array.isArray(adIds) || adIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'adIds array is required and must not be empty'
      });
    }

    if ((!couponIds || !Array.isArray(couponIds) || couponIds.length === 0) &&
      (!bannerIds || !Array.isArray(bannerIds) || bannerIds.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Either couponIds or bannerIds array is required'
      });
    }

    if (!['add', 'remove', 'replace'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be one of: add, remove, replace'
      });
    }

    // Validate ObjectIds
    const validAdIds = adIds.map(adId => new mongoose.Types.ObjectId(adId));
    const validCouponIds = couponIds ? couponIds.map(id => new mongoose.Types.ObjectId(id)) : [];
    const validBannerIds = bannerIds ? bannerIds.map(id => new mongoose.Types.ObjectId(id)) : [];

    let updateQuery = {};
    let message = '';

    switch (action) {
      case 'add':
        updateQuery = { $addToSet: { promotion: { $each: validAdIds } } };
        message = 'added to';
        break;
      case 'remove':
        updateQuery = { $pull: { promotion: { $in: validAdIds } } };
        message = 'removed from';
        break;
      case 'replace':
        updateQuery = { $set: { promotion: validAdIds } };
        message = 'replaced in';
        break;
    }

    let couponResults = { modifiedCount: 0 };
    let bannerResults = { modifiedCount: 0 };

    // Update coupons if provided
    if (validCouponIds.length > 0) {
      couponResults = await Coupon.updateMany(
        { _id: { $in: validCouponIds } },
        updateQuery
      );
    }

    // Update banners if provided
    if (validBannerIds.length > 0) {
      bannerResults = await Banner.updateMany(
        { _id: { $in: validBannerIds } },
        updateQuery
      );
    }

    res.status(200).json({
      success: true,
      message: `Ads successfully ${message} selected items`,
      data: {
        coupons: {
          total: validCouponIds.length,
          modified: couponResults.modifiedCount || 0
        },
        banners: {
          total: validBannerIds.length,
          modified: bannerResults.modifiedCount || 0
        },
        action: action,
        updatedBy: 'super_admin'
      }
    });

  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk update'
    });
  }
};