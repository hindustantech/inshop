
import mongoose from 'mongoose';
import Coupon from '../models/coupunModel.js';
import Banner from '../models/Banner.js';

export const getAgencyDashboard = async (req, res) => {
  try {
    const userId = req.user._id; // Logged-in user's ID

    // 1. Stats: Total Coupons and Total Leaflets
    const totalCoupons = await Coupon.countDocuments({ createdby: userId });
    const totalLeaflets = await Banner.countDocuments({ createdby: userId });

    const stats = [
      { label: 'Total Coupons', value: totalCoupons.toString(), icon: 'Ticket', color: 'bg-blue-500' },
      { label: 'Total Leaflets', value: totalLeaflets.toString(), icon: 'FileText', color: 'bg-orange-500' },
    ];

    // 2. Coupon Performance: Monthly data
    const couponData = await Coupon.aggregate([
      { $match: { createdby: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: { $month: '$creationDate' },
          active: { $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$active', false] }, 1, 0] } },
          used: { $sum: { $cond: [{ $gt: ['$currentDistributions', 0] }, 1, 0] } },
        },
      },
      {
        $project: {
          month: {
            $arrayElemAt: [
              ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
              { $subtract: ['$_id', 1] },
            ],
          },
          active: 1,
          inactive: 1,
          used: 1,
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // 3. Coupon Categories
    const categoryData = await Coupon.aggregate([
      { $match: { createdby: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      {
        $project: {
          name: '$category.name',
          value: { $multiply: [{ $divide: ['$count', totalCoupons] }, 100] },
          color: {
            $switch: {
              branches: [
                { case: { $eq: ['$category.name', 'Discount'] }, then: '#3b82f6' },
                { case: { $eq: ['$category.name', 'BOGO'] }, then: '#10b981' },
                { case: { $eq: ['$category.name', 'Free Item'] }, then: '#f59e0b' },
                { case: { $eq: ['$category.name', 'Bundle'] }, then: '#8b5cf6' },
              ],
              default: '#ef4444',
            },
          },
        },
      },
    ]);

    // 4. Coupon Summary
    const couponSummary = await Coupon.find({ createdby: userId })
      .select('title category validTill active')
      .populate('category', 'name')
      .lean()
      .then((coupons) =>
        coupons.map((coupon) => {
          const daysLeft = Math.ceil((new Date(coupon.validTill) - new Date()) / (1000 * 60 * 60 * 24));
          let status = 'active';
          if (daysLeft <= 0) status = 'expired';
          else if (daysLeft <= 10) status = 'expiring-soon';

          return {
            id: coupon._id,
            title: coupon.title,
            type: coupon.category[0]?.name || 'Other',
            expiryDate: coupon.validTill.toISOString().split('T')[0],
            status,
            daysLeft: daysLeft > 0 ? daysLeft : 0,
          };
        })
      );

    // 5. Leaflet Summary
    const leafletSummary = await Banner.find({ createdby: userId })
      .select('title expiryAt')
      .lean()
      .then((banners) =>
        banners.map((banner) => {
          const daysLeft = Math.ceil((new Date(banner.expiryAt) - new Date()) / (1000 * 60 * 60 * 24));
          let status = 'active';
          if (daysLeft <= 0) status = 'expired';
          else if (daysLeft <= 10) status = 'expiring-soon';

          return {
            id: banner._id,
            title: banner.title,
            expiryDate: banner.expiryAt.toISOString().split('T')[0],
            status,
            daysLeft: daysLeft > 0 ? daysLeft : 0,
          };
        })
      );

    res.status(200).json({
      stats,
      couponData,
      categoryData,
      couponSummary,
      leafletSummary,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};