// cron/updateCouponNames.js
import cron from 'node-cron';
import Coupon from '../models/coupunModel.js';
// Generate coupon code like CINS234
const generateCouponCode = () => {
  const prefix = 'CINS';
  const randomDigits = Math.floor(Math.random() * 900 + 100); // 100-999
  return `${prefix}${randomDigits}`;
};

// Cron job that runs every minute
cron.schedule('* * * * *', async () => {
  try {
    console.log('Running coupon name update cron job...');
    
    // Get all coupons
    const coupons = await Coupon.find({});
    
    for (const coupon of coupons) {
      // Generate new coupon name
      const newCouponName = generateCouponCode();
      
      // Update the coupon
      coupon.coupon_name = newCouponName;
      await coupon.save();
      
      console.log(`Updated coupon ${coupon._id} with name: ${newCouponName}`);
    }
    
    console.log(`Coupon name update completed. Updated ${coupons.length} coupons.`);
    
  } catch (error) {
    console.error('Error updating coupon names:', error);
  }
});

console.log('Coupon name update cron job started - runs every minute');