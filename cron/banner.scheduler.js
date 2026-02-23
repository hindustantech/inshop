import cron from "node-cron";
import { markExpiredBannersInactive } from "../controllers/BannerController.js";

// Run every 5 minutes (industry standard)
cron.schedule("*/5 * * * *", async () => {
    console.log("Running banner expiry scheduler...");
    await markExpiredBannersInactive();
});