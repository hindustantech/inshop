// cron/markDailyAbsent.js
import cron from "node-cron";
import mongoose from "mongoose";
import Attendance from "../models/Attandance/Attendance.js";
import Employee from "../models/Attandance/Employee.js";
// Runs at 11:59 PM every night
cron.schedule("59 23 * * *", async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Get all active employees grouped by company
        const employees = await Employee.find({ employmentStatus: "active" }).lean();

        const bulkOps = [];

        for (const emp of employees) {
            // Check if record already exists for today
            const existing = await Attendance.findOne({
                employeeId: emp._id,
                companyId: emp.companyId,
                date: { $gte: today, $lt: tomorrow }
            });

            if (!existing) {
                // No punch today → mark absent
                bulkOps.push({
                    updateOne: {
                        filter: {
                            employeeId: emp._id,
                            companyId: emp.companyId,
                            date: today
                        },
                        update: {
                            $setOnInsert: {
                                employeeId: emp._id,
                                companyId: emp.companyId,
                                date: today,
                                status: "absent",
                                approvalStatus: "approved",
                                isAutoMarked: true,
                                punchIn: null,
                                punchOut: null,
                                workSummary: {
                                    totalMinutes: 0,
                                    payableMinutes: 0,
                                    overtimeMinutes: 0,
                                    lateMinutes: 0,
                                    earlyLeaveMinutes: 0
                                },
                                breaks: [],
                                geoLocation: {
                                    type: "Point",
                                    coordinates: [0, 0]
                                }
                            }
                        },
                        upsert: true
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            await Attendance.bulkWrite(bulkOps, { ordered: false });
            console.log(`[Cron] Marked ${bulkOps.length} employees as absent for ${today.toDateString()}`);
        }

    } catch (err) {
        console.error("[Cron] markDailyAbsent failed:", err);
    }
});