import Banner from "../models/Banner.js";
import Coupon from "../models/coupunModel.js";

// cronJobs/expireCoupons.js
import cron from "node-cron";

// ⏰ Run every day at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    const now = new Date();

    // Find expired coupons and deactivate them
    const result = await Coupon.updateMany(
      { validTill: { $lt: now }, active: true }, // expired and still active
      { $set: { active: false } } // deactivate
    );

    console.log(`[CRON] Expired Coupons Deactivated: ${result.modifiedCount}`);
  } catch (error) {
    console.error("[CRON] Error while deactivating coupons:", error);
  }
});


 
