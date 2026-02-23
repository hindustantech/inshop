import Attendance from "../../models/Attandance/Attendance.js";
import dayjs from "dayjs";

/**
 * Runs at 00:02 AM daily
 * Closes all open attendance safely
 */
export const autoCloseAttendance = async () => {

    const now = dayjs();
    const cutoff = now.startOf("day").add(2, "minute").toDate();
    // 00:02 AM today

    console.log("Running Attendance Auto-Close Job:", cutoff);

    const openAttendances = await Attendance.find({
        punchIn: { $exists: true },
        punchOut: null,
        date: { $lt: now.startOf("day").toDate() } // yesterday records only
    });

    if (!openAttendances.length) return;

    const bulkOps = [];

    for (const att of openAttendances) {

        const autoPunchOutTime = dayjs(att.date)
            .endOf("day")
            .add(2, "minute") // 12:02 AM rule
            .toDate();

        const workedMinutes =
            Math.max(0, (autoPunchOutTime - att.punchIn) / 60000);

        bulkOps.push({
            updateOne: {
                filter: { _id: att._id },
                update: {
                    $set: {
                        punchOut: autoPunchOutTime,
                        lastPunchAt: autoPunchOutTime,
                        isAutoMarked: true,
                        "workSummary.totalMinutes": workedMinutes,
                        "workSummary.payableMinutes": workedMinutes,
                        remarks: "System Auto Punch-Out at 00:02 AM"
                    },
                    $push: {
                        punchHistory: {
                            punchOut: autoPunchOutTime,
                            source: "admin",
                            deviceInfo: { system: true },
                            geoLocation: { system: true }
                        },
                        editLogs: {
                            reason: "AUTO_PUNCH_OUT_MIDNIGHT_POLICY",
                            oldValue: { punchOut: null },
                            newValue: { punchOut: autoPunchOutTime }
                        }
                    }
                }
            }
        });
    }

    await Attendance.bulkWrite(bulkOps);

    console.log(`Auto-closed ${bulkOps.length} attendance records`);
};