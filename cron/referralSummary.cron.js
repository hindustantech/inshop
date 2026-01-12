// cron/referralSummary.cron.js
import cron from "node-cron";
import ReferralUsage from "../models/ReferralUsage.js";
import User from "../models/userModel.js";
import { getReferralStats } from "../services/referralStats.service.js";
import { referralSummaryEmailTemplate } from "../templates/referralEmail.template.js";
import { referralSummaryWhatsappTemplate } from "../templates/referralWhatsapp.template.js";

// import { sendEmail } from "../providers/email.provider.js";
import { sendEmail } from "../providers/email.provider.js";
import { sendWhatsapp } from "../providers/whatsapp.provider.js";

export function startReferralSummaryCron() {
    // Runs every day at 9 AM
    cron.schedule("0 9 * * *", async () => {
        console.log("📊 Referral summary cron started");

        try {
            // Step 1: Get all unique referrers
            const referrerIds = await ReferralUsage.distinct("referrerId");

            for (const referrerId of referrerIds) {
                const user = await User.findById(referrerId).select(
                    "name email phone suspend"
                );

                if (!user || user.suspend) continue;

                const stats = await getReferralStats(referrerId);

                // Skip if no referrals at all
                if (stats.lifetimeCount === 0) continue;

                /* -------- Email -------- */
                if (user.email) {
                    const email = referralSummaryEmailTemplate({
                        name: user.name,
                        lifetime: stats.lifetimeCount,
                        today: stats.todayCount,
                    });

                    await sendEmail({
                        to: user.email,
                        subject: email.subject,
                        html: email.html,
                    });
                }

                /* -------- WhatsApp -------- */
                if (user.phone) {
                    const message = referralSummaryWhatsappTemplate({
                        name: user.name,
                        lifetime: stats.lifetimeCount,
                        today: stats.todayCount,
                    });

                    await sendWhatsapp({
                        to: user.phone,
                        message,
                    });
                }
            }

            console.log("✅ Referral summary cron completed");
        } catch (error) {
            console.error("❌ Referral cron failed:", error);
        }
    });
}
