import User from "../models/userModel.js";
import Coupon from "../models/coupunModel.js";
import UserCoupon from "../models/UserCoupon.js";
import Sales from "../models/Sales.js";
import Banner from "../models/Banner.js";


// Function to get dashboard snapshot for a specific user by userId
// This aggregates data based on user type and returns a structured object
async function getUserDashboardSnapshot(userId) {
  try {
    // Fetch the user by ID
    const user = await User.findById(userId).select('type name email phone profileImage referalCode referredBy referaluseCount availedCouponsId createdCouponsId couponCount');
    if (!user) {
      throw new Error('User not found');
    }

    const userType = user.type;
    let dashboardData = {
      userDetails: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        referralCode: user.referalCode,
        referredBy: user.referredBy,
        referralUseCount: user.referaluseCount,
        couponCount: user.couponCount,
      },
      typeSpecificData: {},
    };

    switch (userType) {
      case 'agency':
        // Agency can create coupons and banners
        // Get all coupons created by this agency (assuming createdby references the agency user)
        const agencyCoupons = await Coupon.find({ createdby: userId })
          .populate('category', 'name') // Assuming Category model has 'name'
          .select('title coupon_image manual_address coupon_srno category coupon_type discountPercentage validTill maxDistributions currentDistributions termsAndConditions is_spacial_copun isTransferable tag');

        // For each coupon, calculate how many users have used it (via UserCoupon where status='used')
        const agencyCouponDetails = await Promise.all(agencyCoupons.map(async (coupon) => {
          const usersUsed = await UserCoupon.countDocuments({ couponId: coupon._id, status: 'used' });
          const availableUsers = coupon.maxDistributions > 0 ? coupon.maxDistributions - coupon.currentDistributions : 'Unlimited';
          return {
            ...coupon.toObject(),
            usersUsed,
            availableUsers,
          };
        }));

        // Get all banners created by this agency
        const agencyBanners = await Banner.find({ createdby: userId })
          .populate('category', 'name')
          .select('title banner_image manual_address google_location_url banner_type search_radius category main_keyword keyword expiryAt');

        dashboardData.typeSpecificData = {
          createdCoupons: agencyCouponDetails,
          createdBanners: agencyBanners,
          totalCouponsCreated: agencyCoupons.length,
          totalBannersCreated: agencyBanners.length,
        };
        break;

      case 'partner':
        // Partner can create coupons
        // Get all coupons created by this partner (assuming createdby or ownerId references the partner)
        const partnerCoupons = await Coupon.find({ $or: [{ createdby: userId }, { ownerId: userId }] })
          .populate('category', 'name')
          .select('title coupon_image manual_address coupon_srno category coupon_type discountPercentage validTill maxDistributions currentDistributions termsAndConditions is_spacial_copun isTransferable tag');

        // For each coupon, get usage details
        const partnerCouponDetails = await Promise.all(partnerCoupons.map(async (coupon) => {
          // How many users used the coupon (UserCoupon with status='used')
          const usersUsed = await UserCoupon.countDocuments({ couponId: coupon._id, status: 'used' });

          // Sales completed records (Sales with status='completed')
          const completedSales = await Sales.find({ couponId: coupon._id, status: 'completed' })
            .select('userId serviceStartTime serviceEndTime usedCount amount discountAmount finalAmount');

          // Total sales amount from completed sales
          const totalSalesAmount = completedSales.reduce((sum, sale) => sum + sale.finalAmount, 0);

          // Other metrics: total distributions, remaining, etc.
          const totalDistributions = coupon.currentDistributions;
          const remainingDistributions = coupon.maxDistributions > 0 ? coupon.maxDistributions - totalDistributions : 'Unlimited';

          return {
            ...coupon.toObject(),
            usersUsed,
            completedSales: completedSales.length,
            totalSalesAmount,
            totalDistributions,
            remainingDistributions,
            salesRecords: completedSales, // Full records if needed
          };
        }));

        dashboardData.typeSpecificData = {
          createdCoupons: partnerCouponDetails,
          totalCouponsCreated: partnerCoupons.length,
        };
        break;

      case 'user':
        // Regular user can use coupons
        // Get availed coupons details
        const availedCoupons = await UserCoupon.find({ userId: userId })
          .populate({
            path: 'couponId',
            select: 'title discountPercentage validTill termsAndConditions',
          })
          .select('status count transferDate useDate qrCode qrScanDate');

        // Referral details: how many users registered under this user (users where referredBy = this user's referralCode)
        const referredUsers = await User.countDocuments({ referredBy: user.referalCode });

        // Other user-specific data: availed coupons history
        const activeCoupons = availedCoupons.filter(c => c.status === 'available').length;
        const usedCoupons = availedCoupons.filter(c => c.status === 'used').length;

        dashboardData.typeSpecificData = {
          availedCoupons,
          totalAvailed: availedCoupons.length,
          activeCoupons,
          usedCoupons,
          referredUsers, // How many users registered under this user
        };
        break;

      default:
        throw new Error('Unsupported user type');
    }

    return dashboardData;
  } catch (error) {
    console.error('Error fetching dashboard snapshot:', error);
    throw error;
  }
}

