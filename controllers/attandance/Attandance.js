import Employee from "../../models/Attandance/Employee.js";
// import Employee from "../../models/Attandance/Employee.js";
import Attendance from "../../models/Attandance/Attendance.js";
import Holiday from "../../models/Attandance/Holiday.js";
import Payroll from "../../models/Attandance/Payroll.js";
import mongoose from "mongoose";
import { normalizeToUTCDate, buildDateRange } from "./utils/date.utils.js";
import { Parser } from "json2csv";
import XLSX from "xlsx";
// import moment from "moment";
import moment from "moment-timezone";
import jwt from "jsonwebtoken";
import User from "../../models/userModel.js";
// import { resolveDateRange } from "../../utils/dateRangeResolver.js";
// utils/dateRange.js
import ExcelJS from "exceljs";

export const buildMonthRange = (year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    return { start, end };
};


export const getUTCDayRange = (inputDate = new Date()) => {
    const start = new Date(Date.UTC(
        inputDate.getUTCFullYear(),
        inputDate.getUTCMonth(),
        inputDate.getUTCDate(),
        0, 0, 0, 0
    ));

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return { start, end };
};




export const getTodayPunchStatus = async (req, res) => {
    try {
        const userId = req.user._id;

        /* ==============================
           STEP 1: Resolve Employee
        ============================== */

        const employee = await Employee.findOne({
            userId,
            employmentStatus: "active"
        })
            .select("_id companyId")
            .lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee profile not found"
            });
        }

        const { _id: employeeId, companyId } = employee;

        /* ==============================
           STEP 2: Get Today Range
        ============================== */

        const { start, end } = getUTCDayRange();

        /* ==============================
           STEP 3: Query Attendance
        ============================== */

        const attendance = await Attendance.findOne({
            companyId,
            employeeId,
            date: { $gte: start, $lt: end }
        })
            .select("punchIn punchOut")
            .lean();

        return res.status(200).json({
            success: true,
            isPunchedIn: Boolean(attendance?.punchIn),
            isPunchedOut: Boolean(attendance?.punchOut)
        });

    } catch (error) {
        console.error("Punch Status Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

/* =====================================================
   Utility Functions
===================================================== */

// Distance in meters (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const toRad = (x) => (x * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Minutes between two dates
function diffMinutes(start, end) {
    return Math.max(0, Math.floor((end - start) / 60000));
}

// Normalize date (00:00:00)
function normalizeDate(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
}




const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ===============================================================
   DATE RANGE RESOLVER — fixes the 32-day bug
   Always uses UTC midnight so (end - start) counts exact days.
=============================================================== */
const resolveDateRange = (fromDate, toDate) => {
    // Parse as local date parts to avoid timezone shift
    const parseLocal = (str) => {
        const [y, m, d] = str.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    };

    const start = parseLocal(fromDate); // e.g. 2025-03-01 → UTC 2025-03-01T00:00:00Z
    const end = parseLocal(toDate);   // e.g. 2025-03-31 → UTC 2025-03-31T00:00:00Z

    // Set end to 23:59:59.999 UTC so $lte catches all records that day
    end.setUTCHours(23, 59, 59, 999);

    return { start, end };
};

/* ===============================================================
   BUILD WEEK-OFF MAP
   For every active employee, count how many days in [start, end]
   fall on their weekly-off days.
=============================================================== */
const buildWeekOffMap = async (companyId, start, end) => {
    const employees = await Employee.find(
        { companyId, employmentStatus: "active" },
        { _id: 1, weeklyOff: 1 }
    ).lean();

    const map = new Map(); // Map<employeeId string, weekOffCount>

    for (const emp of employees) {
        const weeklyOffDays = emp.weeklyOff?.length ? emp.weeklyOff : ["Sunday"];

        const offDayNumbers = new Set(
            weeklyOffDays
                .map(d => DAY_NAMES.indexOf(d))
                .filter(n => n !== -1)
        );

        let count = 0;
        const cursor = new Date(start);
        // Use UTC getters so DST doesn't add a phantom day
        while (cursor <= end) {
            if (offDayNumbers.has(cursor.getUTCDay())) count++;
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        map.set(emp._id.toString(), count);
    }

    return map;
};

/* ===============================================================
   CORE EXPORT FUNCTION
=============================================================== */
export const exportCompanyAttendanceSummary = async ({ companyId, fromDate, toDate }) => {
    const { start, end } = resolveDateRange(fromDate, toDate);

    const msPerDay = 1000 * 60 * 60 * 24;

    // Use UTC midnight of start & a fresh UTC-midnight copy of end for day counting
    const endMidnight = new Date(Date.UTC(
        end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()
    ));
    const startMidnight = new Date(Date.UTC(
        start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()
    ));

    // FIXED: +1 gives inclusive count; 1 Mar – 31 Mar → 31 days, NOT 32
    const totalCalendarDays = Math.round((endMidnight - startMidnight) / msPerDay) + 1;

    const weekOffMap = await buildWeekOffMap(companyId, start, end);

    const pipeline = [

        /* ── 1. MATCH ──────────────────────────────────────────── */
        {
            $match: {
                companyId: new mongoose.Types.ObjectId(companyId),
                date: { $gte: start, $lte: end }
            }
        },

        /* ── 2. JOIN EMPLOYEE ──────────────────────────────────── */
        {
            $lookup: {
                from: "employees",
                localField: "employeeId",
                foreignField: "_id",
                as: "employee"
            }
        },
        { $unwind: "$employee" },

        /* ── 3. BREAK MINUTES ──────────────────────────────────── */
        {
            $addFields: {
                breakMinutes: {
                    $sum: {
                        $map: {
                            input: "$breaks",
                            as: "b",
                            in: {
                                $cond: [
                                    { $and: ["$$b.start", "$$b.end"] },
                                    { $divide: [{ $subtract: ["$$b.end", "$$b.start"] }, 60000] },
                                    0
                                ]
                            }
                        }
                    }
                }
            }
        },

        /* ── 4. NET WORK MINUTES ───────────────────────────────── */
        {
            $addFields: {
                netWorkMinutes: {
                    $max: [{ $subtract: ["$workSummary.totalMinutes", "$breakMinutes"] }, 0]
                }
            }
        },

        /* ── 5. GROUP BY EMPLOYEE ──────────────────────────────── */
        {
            $group: {
                _id: "$employeeId",

                empCode: { $first: "$employee.empCode" },
                employeeName: { $first: "$employee.user_name" },
                department: { $first: "$employee.jobInfo.department" },
                designation: { $first: "$employee.jobInfo.designation" },

                recordedDays: { $sum: 1 },

                holidayDays: {
                    $sum: { $cond: [{ $eq: ["$status", "holiday"] }, 1, 0] }
                },
                leaveDays: {
                    $sum: { $cond: [{ $eq: ["$status", "leave"] }, 1, 0] }
                },
                weekOffRecorded: {
                    $sum: { $cond: [{ $eq: ["$status", "week_off"] }, 1, 0] }
                },

                // Days that have a record (any status except holiday / leave / week_off)
                workingRecordedDays: {
                    $sum: {
                        $cond: [
                            { $not: { $in: ["$status", ["holiday", "week_off", "leave"]] } },
                            1, 0
                        ]
                    }
                },

                // Present: approved + not auto-marked + both punches + worked > 0
                presentDays: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $not: { $in: ["$status", ["leave", "holiday", "week_off"]] } },
                                    { $eq: ["$approvalStatus", "approved"] },
                                    { $eq: ["$isAutoMarked", false] },
                                    { $ne: ["$punchIn", null] },
                                    { $ne: ["$punchOut", null] },
                                    { $gt: ["$workSummary.totalMinutes", 0] }
                                ]
                            },
                            1, 0
                        ]
                    }
                },

                // FIXED absent logic:
                //   • status === "absent"  → always absent (no extra conditions)
                //   • missing punch (approved, not auto-marked, not holiday/leave/week_off/absent)
                absentFromRecord: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    // Explicit absent status — counts regardless of approval / punch
                                    { $eq: ["$status", "absent"] },

                                    // Missing punch for a working-day record
                                    {
                                        $and: [
                                            { $not: { $in: ["$status", ["leave", "holiday", "week_off", "absent"]] } },
                                            { $eq: ["$approvalStatus", "approved"] },
                                            { $eq: ["$isAutoMarked", false] },
                                            {
                                                $or: [
                                                    { $eq: ["$punchIn", null] },
                                                    { $eq: ["$punchOut", null] }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            },
                            1, 0
                        ]
                    }
                },

                // Exception: auto-marked OR not approved (but not holiday/leave/week_off)
                exceptionDays: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $not: { $in: ["$status", ["leave", "holiday", "week_off"]] } },
                                    {
                                        $or: [
                                            { $eq: ["$isAutoMarked", true] },
                                            { $ne: ["$approvalStatus", "approved"] }
                                        ]
                                    }
                                ]
                            },
                            1, 0
                        ]
                    }
                },

                totalWorkedMinutes: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $not: { $in: ["$status", ["leave", "holiday", "week_off"]] } },
                                    { $eq: ["$approvalStatus", "approved"] },
                                    { $eq: ["$isAutoMarked", false] },
                                    { $ne: ["$punchIn", null] },
                                    { $ne: ["$punchOut", null] }
                                ]
                            },
                            "$netWorkMinutes",
                            0
                        ]
                    }
                }
            }
        },

        /* ── 6. PROJECT ────────────────────────────────────────── */
        {
            $project: {
                _id: 1,
                empCode: 1,
                employeeName: 1,
                department: 1,
                designation: 1,
                holidayDays: 1,
                leaveDays: 1,
                weekOffRecorded: 1,
                workingRecordedDays: 1,
                presentDays: 1,
                absentFromRecord: 1,
                exceptionDays: 1,
                totalWorkedMinutes: 1
            }
        },

        { $sort: { empCode: 1 } }
    ];

    const rawResults = await Attendance.aggregate(pipeline, { allowDiskUse: true });

    /* ── 7. MERGE weekOffMap + FINAL COUNTS ─────────────────────── */
    return rawResults.map(row => {
        const empId = row._id.toString();

        const weekOffDays = weekOffMap.has(empId)
            ? weekOffMap.get(empId)
            : row.weekOffRecorded;

        /*
         * missingWorkingDays = calendar days in range that have NO attendance record
         *                      AND are NOT a holiday / leave
         *                      (week_off intentionally NOT subtracted here)
         *
         * Formula:
         *   totalCalendarDays
         *   - holidayDays           (has record, non-working)
         *   - leaveDays             (has record, non-working)
         *   - workingRecordedDays   (has record, working)
         *   ─────────────────────────────────────────────
         *   = working days with NO record at all → treat as absent
         */
        const missingWorkingDays = Math.max(
            totalCalendarDays
            - row.holidayDays
            - row.leaveDays
            - row.workingRecordedDays,
            0
        );

        const absentDays = row.absentFromRecord + missingWorkingDays;
        const totalWorkedHours = Math.round((row.totalWorkedMinutes / 60) * 100) / 100;
        const averageWorkingHours = row.presentDays > 0
            ? Math.round((totalWorkedHours / row.presentDays) * 100) / 100
            : 0;

        return {
            empCode: row.empCode ?? "",
            employeeName: row.employeeName ?? "",
            department: row.department ?? "",
            designation: row.designation ?? "",
            totalDays: totalCalendarDays,
            holidayDays: row.holidayDays,
            weekOffDays,
            leaveDays: row.leaveDays,
            presentDays: row.presentDays,
            absentDays,
            exceptionDays: row.exceptionDays,
            totalWorkedHours,
            averageWorkingHours
        };
    });
};

/* ===============================================================
   CSV FIELD DEFINITIONS
=============================================================== */
export const AttendanceSummaryFields = [
    "empCode",
    "employeeName",
    "department",
    "designation",
    "totalDays",
    "holidayDays",
    "weekOffDays",
    "leaveDays",
    "presentDays",
    "absentDays",
    "exceptionDays",
    "totalWorkedHours",
    "averageWorkingHours"
];

/* ===============================================================
   CSV EXPORT CONTROLLER
=============================================================== */
export const exportAttendanceAsCSV = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;

        if (!fromDate || !toDate) {
            return res.status(400).json({
                success: false,
                message: "fromDate and toDate query params are required (YYYY-MM-DD)"
            });
        }

        const data = await exportCompanyAttendanceSummary({
            companyId: req.user._id,
            fromDate,
            toDate
        });

        if (!data.length) {
            return res.status(404).json({ success: false, message: "No data found" });
        }

        const parser = new Parser({ fields: AttendanceSummaryFields });
        const csv = parser.parse(data);

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=attendance_summary_${fromDate}_to_${toDate}.csv`
        );
        res.status(200).send(csv);

    } catch (err) {
        console.error("Attendance Export Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};



// Export as Excel
export const exportAttendanceAsExcel = async (req, res) => {
    try {
        const raw = await exportCompanyAttendanceSummary({
            companyId: req.user._id,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate
        });

        if (!raw.length) {
            return res.status(404).json({ success: false, message: "No data found" });
        }

        const data = raw.map(mapAttendanceSummary);

        const wb = XLSX.utils.book_new();

        const worksheetData = data.map(r => ({
            "Employee Code": r.empCode,
            "Employee Name": r.employeeName,
            "Department": r.department,
            "Designation": r.designation,
            "Total Days": r.totalDays,
            "Present Days": r.presentDays,
            "Absent Days": r.absentDays,
            "Total Worked (Hours)": r.totalWorkedHours,
            "Average Working (Hours)": r.averageWorkingHours
        }));

        const ws = XLSX.utils.json_to_sheet(worksheetData);

        ws["!cols"] = [
            { wch: 15 },
            { wch: 25 },
            { wch: 20 },
            { wch: 20 },
            { wch: 10 },
            { wch: 12 },
            { wch: 12 },
            { wch: 18 },
            { wch: 20 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Attendance Summary");

        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=attendance_summary.xlsx`
        );

        res.send(buffer);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Unified export endpoint
export const getAttendanceExport = async (req, res) => {
    try {
        const { format = 'json' } = req.query;

        if (format === 'csv') {
            return await exportAttendanceAsCSV(req, res);
        } else if (format === 'excel') {
            return await exportAttendanceAsExcel(req, res);
        } else {
            // Return JSON as before
            const data = await exportCompanyAttendanceSummary({
                companyId: req.user._id,
                fromDate: req.query.fromDate,
                toDate: req.query.toDate
            });

            res.json({
                success: true,
                data,
                meta: {
                    totalRecords: data.length,
                    dateRange: {
                        fromDate: req.query.fromDate || 'Last 31 days',
                        toDate: req.query.toDate || 'Today'
                    }
                }
            });
        }

    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};


/* ======================================================
   MARK ATTENDANCE (Punch In + Multi Punch Out)
====================================================== */

export const markAttendance = async (req, res) => {

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

        /* --------------------------------
           1. Auth + Body
        -------------------------------- */

        const u_id = req.user._id;

        const {
            date,
            punchIn,
            punchOut,
            breaks,
            geoLocation,
            deviceInfo,
            shift,
            remarks,
            token
        } = req.body;


        if (!token) {
            return res.status(401).json({
                message: "Attendance token required"
            });
        }

        if (!date || !geoLocation?.coordinates) {
            return res.status(400).json({
                message: "date and geoLocation required"
            });
        }


        /* --------------------------------
           2. Verify JWT
        -------------------------------- */

        let decoded;

        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                message: "Invalid or expired token"
            });
        }

        if (!decoded?.userId) {
            return res.status(401).json({
                message: "Invalid token payload"
            });
        }


        const user = await User
            .findById(decoded.userId)
            .select("-password -otp -__v");

        if (!user) {
            return res.status(401).json({
                message: "User not found"
            });
        }


        const companyId = user._id;


        /* --------------------------------
           3. Employee Validation
        -------------------------------- */

        const employee = await Employee.findOne({
            userId: u_id,
            employmentStatus: "active"
        }).session(session);

        if (!employee) {
            return res.status(404).json({
                message: "Active employee not found"
            });
        }

        if (employee.companyId.toString() !== companyId.toString()) {
            return res.status(403).json({
                message: "Unauthorized company"
            });
        }


        const attendanceDate = normalizeDate(date);


        /* --------------------------------
           4. Check Holiday
        -------------------------------- */

        const holiday = await Holiday.findOne({
            companyId,
            date: attendanceDate
        }).session(session);

        let status = holiday ? "holiday" : "present";


        /* --------------------------------
           5. Geo Fence Validation
        -------------------------------- */

        let geoVerified = false;
        let suspicious = false;

        if (employee.officeLocation?.coordinates?.length === 2) {

            const [officeLng, officeLat] =
                employee.officeLocation.coordinates;

            const [userLng, userLat] =
                geoLocation.coordinates;

            const distance = getDistance(
                officeLat,
                officeLng,
                userLat,
                userLng
            );


            // Outside allowed radius
            if (distance > employee.officeLocation.radius) {

                return res.status(403).json({
                    success: false,
                    errorCode: "OUTSIDE_OFFICE_RADIUS",
                    message: "You are not within the allowed office location range.",
                    data: {
                        allowedRadius: employee.officeLocation.radius,
                        currentDistance: Math.round(distance),
                        unit: "meters"
                    }
                });

            } else {
                geoVerified = true;
            }
        }


        /* --------------------------------
           6. Find Existing Attendance
        -------------------------------- */

        let attendance = await Attendance.findOne({
            companyId,
            employeeId: employee._id,
            date: attendanceDate
        }).session(session);


        /* --------------------------------
           7. FIRST TIME → PUNCH IN
        -------------------------------- */

        if (!attendance) {

            if (!punchIn) {
                return res.status(400).json({
                    message: "Punch In required"
                });
            }

            const inTime = new Date(punchIn);
            const outTime = punchOut ? new Date(punchOut) : null;


            let totalMinutes = 0;

            if (outTime) {
                totalMinutes = diffMinutes(inTime, outTime);
            }


            /* Break Deduction */

            if (breaks?.length) {
                for (const b of breaks) {
                    if (b.start && b.end) {
                        totalMinutes -= diffMinutes(
                            new Date(b.start),
                            new Date(b.end)
                        );
                    }
                }
            }


            let overtimeMinutes = 0;
            let lateMinutes = 0;
            let earlyLeaveMinutes = 0;


            /* Shift Calculation */

            if (shift?.startTime && shift?.endTime) {

                const shiftStart = new Date(
                    `${attendanceDate
                        .toISOString()
                        .split("T")[0]}T${shift.startTime}:00`
                );

                const shiftEnd = new Date(
                    `${attendanceDate
                        .toISOString()
                        .split("T")[0]}T${shift.endTime}:00`
                );

                if (inTime > shiftStart) {
                    lateMinutes = diffMinutes(shiftStart, inTime);
                }

                if (outTime && outTime < shiftEnd) {
                    earlyLeaveMinutes = diffMinutes(outTime, shiftEnd);
                }

                if (outTime && outTime > shiftEnd) {
                    overtimeMinutes = diffMinutes(shiftEnd, outTime);
                }
            }


            if (totalMinutes < 240 && status === "present") {
                status = "half_day";
            }

            if (!outTime) {
                suspicious = true;
            }


            /* Create Attendance */

            attendance = new Attendance({

                companyId,
                employeeId: employee._id,

                date: attendanceDate,

                punchIn: inTime,
                punchOut: outTime,

                breaks,
                shift,

                status,

                geoLocation: {
                    ...geoLocation,
                    verified: geoVerified
                },

                deviceInfo,

                workSummary: {
                    totalMinutes,
                    overtimeMinutes,
                    lateMinutes,
                    earlyLeaveMinutes
                },

                remarks,

                isSuspicious: suspicious,

                punchHistory: outTime ? [{
                    punchOut: outTime,
                    deviceInfo,
                    geoLocation
                }] : []
            });

        }


        /* --------------------------------
           8. ALREADY EXISTS → PUNCH OUT
        -------------------------------- */

        else {

            if (!punchOut) {
                return res.status(400).json({
                    message: "Punch Out required"
                });
            }

            const outTime = new Date(punchOut);


            /* Anti-Spam */

            const last = attendance.punchHistory?.at(-1);

            if (last) {

                const gap = diffMinutes(
                    new Date(last.punchOut),
                    outTime
                );

                if (gap < 3) {
                    return res.status(429).json({
                        message: "Too frequent punch"
                    });
                }
            }


            /* Save History */

            attendance.punchHistory.push({
                punchOut: outTime,
                deviceInfo,
                geoLocation
            });


            /* Update Latest */

            attendance.punchOut = outTime;


            /* Recalculate */

            const inTime = new Date(attendance.punchIn);

            let totalMinutes =
                diffMinutes(inTime, outTime);


            if (attendance.breaks?.length) {
                for (const b of attendance.breaks) {
                    if (b.start && b.end) {
                        totalMinutes -= diffMinutes(
                            new Date(b.start),
                            new Date(b.end)
                        );
                    }
                }
            }


            let overtimeMinutes = 0;
            let lateMinutes = 0;
            let earlyLeaveMinutes = 0;


            if (
                attendance.shift?.startTime &&
                attendance.shift?.endTime
            ) {

                const shiftStart = new Date(
                    `${attendanceDate
                        .toISOString()
                        .split("T")[0]}T${attendance.shift.startTime}:00`
                );

                const shiftEnd = new Date(
                    `${attendanceDate
                        .toISOString()
                        .split("T")[0]}T${attendance.shift.endTime}:00`
                );

                if (inTime > shiftStart) {
                    lateMinutes =
                        diffMinutes(shiftStart, inTime);
                }

                if (outTime < shiftEnd) {
                    earlyLeaveMinutes =
                        diffMinutes(outTime, shiftEnd);
                }

                if (outTime > shiftEnd) {
                    overtimeMinutes =
                        diffMinutes(shiftEnd, outTime);
                }
            }


            attendance.workSummary = {
                totalMinutes,
                overtimeMinutes,
                lateMinutes,
                earlyLeaveMinutes
            };


            attendance.status =
                totalMinutes < 240
                    ? "half_day"
                    : "present";


            /* Device Fraud */

            if (
                attendance.deviceInfo?.deviceId &&
                attendance.deviceInfo.deviceId !==
                deviceInfo?.deviceId
            ) {
                attendance.isSuspicious = true;
            }

        }


        /* --------------------------------
           9. Save + Commit
        -------------------------------- */

        await attendance.save({ session });

        await session.commitTransaction();
        session.endSession();


        return res.status(201).json({
            message: "Attendance processed successfully",
            attendance
        });


    } catch (error) {

        await session.abortTransaction();
        session.endSession();

        console.error("Attendance Error:", error);

        return res.status(500).json({
            message: "Attendance failed",
            error: error.message
        });
    }
};





// utils/date.util.js

export const getISTDayRange = () => {

    const now = new Date();

    // Convert to IST first
    const istNow = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    const start = new Date(istNow);
    start.setHours(0, 0, 0, 0);

    const end = new Date(istNow);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};
export const toIST = (date) => {
    if (!date) return null;

    const d = new Date(date);

    if (isNaN(d.getTime())) return null;

    return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false
    });
};

// utils/date.util.js
export const convertUTCtoIST = (date) => {
    if (!date) return null;
    return new Date(new Date(date).getTime() + (5.5 * 60 * 60 * 1000));
};


export const getCompanyTodayAttendance = async (req, res) => {

    try {

        /* ===========================
           Auth Context
        ============================ */

        const companyId = req.user._id;

        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        /* ===========================
           Date
        ============================ */

        const today = normalizeToUTCDate();

        /* ===========================
           Active Employees
        ============================ */

        const employees = await Employee.find({
            companyId,
            employmentStatus: "active"
        })
            .select("_id empCode user_name ")
            .lean();

        if (!employees.length) {
            return res.status(404).json({
                success: false,
                message: "No active employees found"
            });
        }

        const employeeIds = employees.map(e => e._id);

        /* ===========================
           Attendance Records
        ============================ */

        const { start, end } = getISTDayRange();

        const attendanceList = await Attendance.find({
            companyId,
            employeeId: { $in: employeeIds },
            date: { $gte: start, $lte: end }
        })
            .select(`
                employeeId
                status
                punchIn
                punchOut
                workSummary
                isSuspicious
                geoLocation.verified
            `)
            .lean();

        /* ===========================
           Map Attendance
        ============================ */

        const attendanceMap = new Map();

        attendanceList.forEach(record => {
            attendanceMap.set(
                record.employeeId.toString(),
                record
            );
        });

        /* ===========================
           Merge (Employee + Attendance)
        ============================ */

        const result = employees
            .slice(skip, skip + limit)
            .map(emp => {

                const record =
                    attendanceMap.get(emp._id.toString());

                return {

                    employeeId: emp._id,
                    empCode: emp.empCode,
                    name: emp.user_name,
                    phone: emp.phone,
                    email: emp.email,

                    date: today,

                    status: record?.status || "absent",

                    punchIn: convertUTCtoIST(record?.punchIn),
                    punchOut: convertUTCtoIST(record?.punchOut),
                    flags: {

                        isLate:
                            (record?.workSummary?.lateMinutes || 0) > 0,

                        isEarlyLeave:
                            (record?.workSummary?.earlyLeaveMinutes || 0) > 0,

                        isOvertime:
                            (record?.workSummary?.overtimeMinutes || 0) > 0,

                        isSuspicious:
                            record?.isSuspicious || false,

                        geoVerified:
                            record?.geoLocation?.verified || false
                    },

                    workSummary: record?.workSummary || {
                        totalMinutes: 0,
                        payableMinutes: 0,
                        overtimeMinutes: 0,
                        lateMinutes: 0,
                        earlyLeaveMinutes: 0
                    }
                };
            });

        /* ===========================
           Response
        ============================ */

        return res.status(200).json({

            success: true,

            companyId,

            date: today,

            pagination: {
                page,
                limit,
                totalEmployees: employees.length,
                totalPages: Math.ceil(employees.length / limit)
            },

            data: result
        });

    } catch (error) {

        console.error("Company Today Attendance Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch company attendance"
        });
    }
};





/* ======================================================
   GET: Monthly Employee Card Summary (IST Based)
====================================================== */







export const getEmployeeSimpleMonthlySummary = async (req, res) => {
    try {
        /* =====================================
           1. AUTH
        ===================================== */
        const companyId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(companyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid company id"
            });
        }

        /* =====================================
           2. DATE RANGE
        ===================================== */
        const { startDate, endDate } = req.query;

        const today = new Date();

        const start = startDate
            ? new Date(startDate)
            : new Date(today.getFullYear(), today.getMonth(), 1);

        const end = endDate
            ? new Date(endDate)
            : new Date();

        end.setHours(23, 59, 59, 999);

        const totalDays =
            Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        /* =====================================
           3. EMPLOYEE FETCH ONLY
        ===================================== */
        const report = await Employee.aggregate([
            {
                $match: {
                    companyId: new mongoose.Types.ObjectId(companyId),
                    employmentStatus: "active"
                }
            },

            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            {
                $unwind: {
                    path: "$user",
                    preserveNullAndEmptyArrays: true
                }
            },

            /* =====================================
               4. SAFE PROJECTION (NO 0 VALUES)
            ===================================== */
            {
                $project: {
                    _id: 1,
                    userId: "$user._id",

                    name: { $ifNull: ["$user_name", "Unknown"] },
                    empCode: 1,

                    email: "$user.email",
                    phone: "$user.phone",

                    department: "$jobInfo.department",
                    designation: "$jobInfo.designation",
                    grade: "$jobInfo.grade",

                    joiningDate: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$jobInfo.joiningDate",
                            onNull: null
                        }
                    },

                    /* ===== SAME STRUCTURE ===== */
                    summary: {
                        presentDays: { $literal: 0 },
                        halfDays: { $literal: 0 },
                        leaveDays: { $literal: 0 },
                        absentDays: { $literal: 0 },
                        autoAbsentDays: { $literal: totalDays },
                        totalAbsentDays: { $literal: totalDays },
                        holidayDays: { $literal: 0 },
                        weekOffDays: { $literal: 0 },
                        workingDays: { $literal: 0 },
                        markedDays: { $literal: 0 },
                        totalDays: { $literal: totalDays }
                    },

                    timeSummary: {
                        totalMinutes: { $literal: 0 },
                        totalHours: { $literal: 0 },
                        validWorkingDays: { $literal: 0 },
                        avgHours: { $literal: 0 },
                        payableMinutes: { $literal: 0 },
                        payableHours: { $literal: 0 },
                        overtimeMinutes: { $literal: 0 },
                        overtimeHours: { $literal: 0 }
                    }
                }
            },

            { $sort: { name: 1 } }
        ]);

        /* =====================================
           5. COMPANY SUMMARY (SAFE)
        ===================================== */
        const companySummary = {
            totalEmployees: report.length,
            totalHours: 0,
            totalPayableHours: 0,
            totalOvertime: 0,
            avgHours: 0
        };

        /* =====================================
           6. RESPONSE (UNCHANGED)
        ===================================== */
        return res.status(200).json({
            success: true,
            data: {
                period: {
                    start: start.toISOString().split("T")[0],
                    end: end.toISOString().split("T")[0],
                    totalDays
                },
                summary: companySummary,
                report
            },
            message: "Monthly summary generated successfully"
        });

    } catch (error) {
        console.error("Monthly Summary Error:", error);

        return res.status(500).json({
            success: false,
            message: "Monthly report failed",
            error: error.message
        });
    }
};



export const debugAttendanceData = async (req, res) => {
    try {
        const companyId = req.user._id;

        // 1. Check raw attendance records
        const attendanceRecords = await Attendance.find({
            companyId: new mongoose.Types.ObjectId(companyId)
        })
            .limit(5)
            .lean();

        console.log('Sample Attendance Records:', JSON.stringify(attendanceRecords, null, 2));

        // 2. Check employees
        const employees = await Employee.find({
            companyId: new mongoose.Types.ObjectId(companyId)
        })
            .limit(5)
            .lean();

        console.log('Sample Employees:', JSON.stringify(employees, null, 2));

        // 3. Check users
        const employeeIds = employees.map(e => e.userId);
        const users = await User.find({
            _id: { $in: employeeIds }
        })
            .limit(5)
            .lean();

        console.log('Sample Users:', JSON.stringify(users, null, 2));

        // 4. Count documents
        const counts = {
            totalAttendance: await Attendance.countDocuments({ companyId }),
            totalEmployees: await Employee.countDocuments({ companyId }),
            attendanceWithEmployeeId: await Attendance.countDocuments({
                companyId,
                employeeId: { $exists: true, $ne: null }
            })
        };

        console.log('Document Counts:', counts);

        res.json({
            success: true,
            data: {
                counts,
                sampleAttendance: attendanceRecords,
                sampleEmployees: employees,
                sampleUsers: users
            }
        });

    } catch (error) {
        console.error('Debug Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
/**
 * @desc   Get Employee Monthly Attendance
 * @route  GET /api/attendance/monthly
 * @access Employee
 */
export const getAttendance = async (req, res) => {

    try {

        /* ============================
           1. Auth Context
        ============================ */

        const companyId = req.user.companyId;
        const userId = req.user._id;

        if (!companyId || !userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized access"
            });
        }

        /* ============================
           2. Validate Params
        ============================ */

        const month = Number(req.query.month);
        const year = Number(req.query.year);

        if (
            !month || !year ||
            month < 1 || month > 12 ||
            year < 2000
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid month/year"
            });
        }

        /* ============================
           3. Employee Mapping
        ============================ */

        const employee = await Employee
            .findOne({
                companyId,
                userId,
                employmentStatus: "active"
            })
            .select("_id empCode role")
            .lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Active employee not found"
            });
        }

        /* ============================
           4. Date Range
        ============================ */

        const { start, end } = buildMonthRange(year, month);

        /* ============================
           5. Fetch Attendance
        ============================ */

        const attendance = await Attendance
            .find({
                companyId,
                employeeId: employee._id,
                date: { $gte: start, $lte: end }
            })
            .select(`
                date
                punchIn
                punchOut
                breaks
                status
                workSummary
                geoLocation.verified
                isSuspicious
            `)
            .sort({ date: 1 })
            .lean();

        /* ============================
           6. Response
        ============================ */

        return res.status(200).json({
            success: true,
            meta: {
                employeeId: employee._id,
                empCode: employee.empCode,
                month,
                year,
                totalDays: attendance.length
            },
            data: attendance
        });

    } catch (error) {

        console.error("Attendance Fetch Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch attendance"
        });
    }
};




/* ================================
   Helper: Format Time (IST)
================================ */
// const formatTime = (date) => {
//     if (!date) return "-";

//     try {
//         return new Date(date).toLocaleTimeString("en-IN", {
//             timeZone: "Asia/Kolkata",   // Force IST
//             hour: "2-digit",
//             minute: "2-digit",
//             hour12: true
//         });
//     } catch (err) {
//         console.error("formatTime error:", err);
//         return "-";
//     }
// };


/* ================================
   Helper: Minutes → Hr Min
================================ */
const formatMinutes = (minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return "-";

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return `${h}h ${m}m`;
};


/* =================================================
   GET: Employee Monthly Attendance (Dashboard)
================================================= */



const getDaysInMonth = (year, month) =>
    new Date(year, month, 0).getDate();

/* ============================
   CONTROLLER
============================ */

export const getCompanyAttendanceSummary = async (req, res) => {
    try {
        const { companyId, month, year, format } = req.query;

        /* ============================
           VALIDATION
        ============================ */

        if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid companyId",
            });
        }

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: "month and year are required",
            });
        }

        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        end.setHours(23, 59, 59, 999);

        const totalDays = getDaysInMonth(year, month);

        /* ============================
           AGGREGATION PIPELINE
        ============================ */

        const employees = await Employee.aggregate([
            {
                $match: {
                    companyId: new mongoose.Types.ObjectId(companyId),
                    employmentStatus: "active",
                },
            },

            /* ============================
               JOIN ATTENDANCE
            ============================ */
            {
                $lookup: {
                    from: "attendances",
                    let: { empId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$employeeId", "$$empId"] },
                                        { $gte: ["$date", start] },
                                        { $lte: ["$date", end] },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "attendance",
                },
            },

            /* ============================
               CALCULATIONS
            ============================ */
            {
                $addFields: {
                    /* PRESENT DAYS */
                    presentDays: {
                        $size: {
                            $filter: {
                                input: "$attendance",
                                as: "att",
                                cond: { $eq: ["$$att.status", "present"] },
                            },
                        },
                    },

                    /* EXCEPTION DAYS (AUTO MARKED PRESENT ONLY) */
                    exceptionDays: {
                        $size: {
                            $filter: {
                                input: "$attendance",
                                as: "att",
                                cond: {
                                    $and: [
                                        { $eq: ["$$att.isAutoMarked", true] },
                                        { $eq: ["$$att.status", "present"] },
                                    ],
                                },
                            },
                        },
                    },

                    /* TOTAL WORK MINUTES */
                    totalMinutes: {
                        $sum: {
                            $map: {
                                input: "$attendance",
                                as: "att",
                                in: {
                                    $ifNull: ["$$att.workSummary.totalMinutes", 0],
                                },
                            },
                        },
                    },
                },
            },

            /* ============================
               ABSENT + AVERAGE FIX
            ============================ */
            {
                $addFields: {
                    /* ✅ CORRECT ABSENT */
                    absentDays: {
                        $subtract: [totalDays, "$presentDays"],
                    },

                    /* ✅ AVG MINUTES */
                    avgMinutes: {
                        $cond: [
                            { $gt: ["$presentDays", 0] },
                            { $divide: ["$totalMinutes", "$presentDays"] },
                            0,
                        ],
                    },
                },
            },

            /* ============================
               FINAL SHAPE
            ============================ */
            {
                $project: {
                    empCode: 1,
                    empCodeNumber: {
                        $convert: {
                            input: "$empCode",
                            to: "int",
                            onError: 0,
                            onNull: 0,
                        },
                    },

                    employeeName: {
                        $ifNull: ["$user_name", "-"],
                    },

                    totalDays: { $literal: totalDays },
                    presentDays: 1,
                    absentDays: 1,
                    exceptionDays: 1,

                    totalHours: {
                        $round: [
                            {
                                $divide: [
                                    { $ifNull: ["$totalMinutes", 0] },
                                    60
                                ]
                            },
                            2
                        ]
                    },

                    avgHours: {
                        $round: [
                            {
                                $divide: [
                                    { $ifNull: ["$avgMinutes", 0] },
                                    60
                                ]
                            },
                            2
                        ]
                    }
                },
            },

            /* ============================
               SORT (FIXED)
            ============================ */
            {
                $sort: {
                    empCodeNumber: 1,
                },
            },
        ]);

        /* ============================
           FINAL RESPONSE FORMAT
        ============================ */

        const finalData = employees.map((emp, index) => ({
            "Sr No": index + 1,
            "Employee Code": emp.empCode,
            "Employee Name": emp.employeeName,

            "Total Days": emp.totalDays,
            "Present Days": emp.presentDays,
            "Absent Days": emp.absentDays,
            "Exception Days": emp.exceptionDays,

            "Total Working Hours": Number(emp.totalHours).toFixed(2),
            "Avg Working Hours": Number(emp.avgHours).toFixed(2),
        }));

        /* ============================
           CSV EXPORT
        ============================ */

        if (format === "csv") {
            const parser = new Parser({
                fields: [
                    "Sr No",
                    "Employee Code",
                    "Employee Name",
                    "Total Days",
                    "Present Days",
                    "Absent Days",
                    "Exception Days",
                    "Total Working Hours",
                    "Avg Working Hours",
                ],
            });

            const csv = parser.parse(finalData);

            const fileName = `attendance_summary_${month}_${year}.csv`;

            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${fileName}"`
            );

            return res.status(200).send(csv);
        }

        /* ============================
           JSON RESPONSE
        ============================ */

        return res.status(200).json({
            success: true,
            meta: {
                companyId,
                month,
                year,
                totalEmployees: finalData.length,
            },
            data: finalData,
        });
    } catch (error) {
        console.error("Attendance Summary Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
/* =================================================
   GET: Employee Attendance Summary + CSV
================================================= */


const formatMinutesToHours = (minutes = 0) => {
    if (!minutes || isNaN(minutes)) return "00:00";

    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);

    const formattedHours = String(hrs).padStart(2, "0");
    const formattedMinutes = String(mins).padStart(2, "0");

    return `${formattedHours}:${formattedMinutes}`;
};



/* ============================
   Controller
============================ */



/* ============================
   Controller
============================ */
export const getEmployeeAttendanceSummary = async (req, res) => {
    try {
        /* ============================
           1. Auth Validation
        ============================ */
        const userId = req.query.userId;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        /* ============================
           2. Params
        ============================ */
        const month = Number(req.query.month);
        const year = Number(req.query.year);
        const format = req.query.format;

        if (!month || !year || month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                message: "Invalid month/year"
            });
        }

        /* ============================
           3. Employee Fetch
        ============================ */
        const employee = await Employee.findOne({
            userId,
            employmentStatus: "active"
        })
            .select("_id empCode user_name weeklyOff createdAt") // 👈 IMPORTANT
            .lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        /* ============================
           4. Date Range
        ============================ */
        const { start, end } = buildMonthRange(year, month);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        /* ============================
           5. Attendance Fetch
        ============================ */
        const records = await Attendance.find({
            employeeId: employee._id,
            date: { $gte: start, $lte: end }
        })
            .sort({ date: -1 })
            .lean();

        /* ============================
           6. Map Optimization
        ============================ */
        const map = new Map();
        records.forEach(r => {
            const key = new Date(r.date).toISOString().split("T")[0];
            map.set(key, r);
        });

        /* ============================
           7. Joining Date Logic (FIX)
        ============================ */
        const joiningDate = employee.createdAt
            ? new Date(employee.createdAt)
            : null;

        if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

        const isBeforeJoining = (date) => {
            if (!joiningDate) return false;
            return date < joiningDate;
        };

        /* ============================
           8. Helpers
        ============================ */
        const isPastDate = (date) => {
            return date < today;
        };

        const isWeeklyOff = (date) => {
            const dayOfWeek = [
                "Sunday", "Monday", "Tuesday",
                "Wednesday", "Thursday", "Friday", "Saturday"
            ][date.getDay()];

            return employee.weeklyOff?.includes(dayOfWeek);
        };

        /* ============================
           9. Loop Setup
        ============================ */
        const isCurrentMonth =
            today.getFullYear() === year &&
            today.getMonth() + 1 === month;

        const lastDay = isCurrentMonth
            ? today.getDate()
            : new Date(year, month, 0).getDate();

        let presentDays = 0;
        let absentDays = 0;
        let totalMinutes = 0;

        const report = [];

        /* ============================
           10. Main Loop
        ============================ */
        for (let i = lastDay; i >= 1; i--) {
            const date = new Date(year, month - 1, i);
            date.setHours(0, 0, 0, 0);

            const key = date.toISOString().split("T")[0];
            const rec = map.get(key);

            const label = date.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short"
            });

            /* ============================
               🚨 BEFORE JOINING (FIXED)
            ============================ */
            if (isBeforeJoining(date)) {
                report.push({
                    Date: label,
                    EmpName: employee.user_name || "-",
                    EmpCode: employee.empCode,
                    TimeIn: "-",
                    TimeOut: "-",
                    TotalHours: "00:00"
                });
                continue;
            }

            /* ============================
               NO RECORD
            ============================ */
            if (!rec) {
                if (isPastDate(date)) {
                    if (isWeeklyOff(date)) {
                        report.push({
                            Date: label,
                            EmpName: employee.user_name || "-",
                            EmpCode: employee.empCode,
                            TimeIn: "Week Off",
                            TimeOut: "-",
                            TotalHours: "00:00"
                        });
                    } else {
                        absentDays++;
                        report.push({
                            Date: label,
                            EmpName: employee.user_name || "-",
                            EmpCode: employee.empCode,
                            TimeIn: "Absent",
                            TimeOut: "-",
                            TotalHours: "00:00"
                        });
                    }
                } else {
                    report.push({
                        Date: label,
                        EmpName: employee.user_name || "-",
                        EmpCode: employee.empCode,
                        TimeIn: "-",
                        TimeOut: "-",
                        TotalHours: "00:00"
                    });
                }
                continue;
            }

            /* ============================
               STATUS HANDLING
            ============================ */
            if (["holiday", "week_off"].includes(rec.status)) {
                report.push({
                    Date: label,
                    EmpName: employee.user_name || "-",
                    EmpCode: employee.empCode,
                    TimeIn: rec.status === "holiday" ? "Holiday" : "Week Off",
                    TimeOut: "-",
                    TotalHours: "00:00"
                });
                continue;
            }

            if (rec.status === "leave") {
                report.push({
                    Date: label,
                    EmpName: employee.user_name || "-",
                    EmpCode: employee.empCode,
                    TimeIn: "Leave",
                    TimeOut: "-",
                    TotalHours: "00:00"
                });
                continue;
            }

            const hasValidPunch =
                rec.punchIn &&
                rec.punchOut &&
                rec.workSummary?.totalMinutes > 0;

            const isValidWork =
                rec.status === "present" &&
                hasValidPunch &&
                !rec.isAutoMarked;

            if (isValidWork) {
                presentDays++;
                totalMinutes += rec.workSummary.totalMinutes;

                report.push({
                    Date: label,
                    EmpName: employee.user_name || "-",
                    EmpCode: employee.empCode,
                    TimeIn: formatTime(rec.punchIn),
                    TimeOut: formatTime(rec.punchOut),
                    TotalHours: formatMinutesToHours(rec.workSummary.totalMinutes)
                });
            } else if (rec.status === "present" && !hasValidPunch) {
                absentDays++;
                report.push({
                    Date: label,
                    EmpName: employee.user_name || "-",
                    EmpCode: employee.empCode,
                    TimeIn: "Absent",
                    TimeOut: "-",
                    TotalHours: "00:00"
                });
            } else {
                const minutes = hasValidPunch
                    ? rec.workSummary.totalMinutes
                    : 0;

                report.push({
                    Date: label,
                    EmpName: employee.user_name || "-",
                    EmpCode: employee.empCode,
                    TimeIn: rec.punchIn ? formatTime(rec.punchIn) : "-",
                    TimeOut: rec.punchOut ? formatTime(rec.punchOut) : "-",
                    TotalHours: formatMinutesToHours(minutes)
                });
            }
        }

        /* ============================
           11. Summary
        ============================ */
        const avgMinutes = presentDays
            ? totalMinutes / presentDays
            : 0;

        const avgHours = formatMinutesToHours(avgMinutes);

        /* ============================
           12. CSV Export
        ============================ */
        if (format === "csv") {
            const parser = new Parser({
                fields: ["Date", "EmpName", "EmpCode", "TimeIn", "TimeOut", "TotalHours"]
            });

            const csv = parser.parse(report);

            const fileName = `attendance_${employee.empCode}_${month}_${year}.csv`;

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

            return res.status(200).send(csv);
        }

        /* ============================
           13. Response
        ============================ */
        return res.status(200).json({
            success: true,
            meta: {
                employeeId: employee._id,
                empCode: employee.empCode,
                empName: employee.user_name,
                month,
                year
            },
            summary: {
                avgPerDay: avgHours,
                presentDays,
                absentDays,
                totalDays: lastDay
            },
            records: report
        });

    } catch (error) {
        console.error("Attendance Summary Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};
/**
 * @desc   Get Monthly Attendance Summary (Payroll)
 * @route  GET /api/attendance/summary
 * @access Employee
 */
export const getMonthlySummary = async (req, res) => {

    try {

        /* ============================
           1. Auth Context
        ============================ */

        const companyId = req.user.companyId;
        const userId = req.user._id;

        /* ============================
           2. Validate Params
        ============================ */

        const month = Number(req.query.month);
        const year = Number(req.query.year);

        if (
            !month || !year ||
            month < 1 || month > 12
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid month/year"
            });
        }

        /* ============================
           3. Employee
        ============================ */

        const employee = await Employee
            .findOne({
                companyId,
                userId,
                employmentStatus: "active"
            })
            .select("_id salaryStructure")
            .lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        /* ============================
           4. Date Range
        ============================ */

        const { start, end } = buildMonthRange(year, month);

        /* ============================
           5. Aggregation (Index Aware)
        ============================ */

        const summary = await Attendance.aggregate([

            {
                $match: {
                    companyId: new mongoose.Types.ObjectId(companyId),
                    employeeId: employee._id,
                    date: { $gte: start, $lte: end }
                }
            },

            {
                $group: {

                    _id: "$status",

                    days: { $sum: 1 },

                    totalMinutes: {
                        $sum: "$workSummary.totalMinutes"
                    },

                    overtimeMinutes: {
                        $sum: "$workSummary.overtimeMinutes"
                    },

                    lateMinutes: {
                        $sum: "$workSummary.lateMinutes"
                    },

                    earlyLeaveMinutes: {
                        $sum: "$workSummary.earlyLeaveMinutes"
                    }
                }
            }
        ]);

        /* ============================
           6. Normalize Output
        ============================ */

        const stats = {
            present: 0,
            absent: 0,
            leave: 0,
            holiday: 0,
            half_day: 0,
            week_off: 0
        };

        let payrollMinutes = 0;
        let overtimeMinutes = 0;

        summary.forEach(item => {

            stats[item._id] = item.days;

            payrollMinutes += item.totalMinutes || 0;

            overtimeMinutes += item.overtimeMinutes || 0;
        });

        /* ============================
           7. Salary Estimation
        ============================ */

        const perHour = employee.salaryStructure?.perHour || 0;
        const overtimeRate = employee.salaryStructure?.overtimeRate || 0;

        const payableHours = payrollMinutes / 60;
        const overtimeHours = overtimeMinutes / 60;

        const basePay = payableHours * perHour;
        const overtimePay = overtimeHours * overtimeRate;

        /* ============================
           8. Response
        ============================ */

        return res.status(200).json({

            success: true,

            period: { month, year },

            attendance: stats,

            work: {
                totalMinutes: payrollMinutes,
                overtimeMinutes,
                payableHours,
                overtimeHours
            },

            payroll: {
                perHour,
                overtimeRate,
                basePay,
                overtimePay,
                grossPay: basePay + overtimePay
            }
        });

    } catch (error) {

        console.error("Summary Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to generate summary"
        });
    }
};



/**
 * @desc Employee Today Attendance
 */
export const getTodayAttendance = async (req, res) => {

    try {

        /* ======================
           Auth Context
        ====================== */

        const userId = req.user._id;
        const companyId = req.user.companyId;

        /* ======================
           Employee
        ====================== */

        const employee = await Employee.findOne({
            userId,
            companyId,
            employmentStatus: "active"
        })
            .select("_id empCode")
            .lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        /* ======================
           Date
        ====================== */

        const today = normalizeToUTCDate();

        /* ======================
           Attendance
        ====================== */

        const record = await Attendance.findOne({
            companyId,
            employeeId: employee._id,
            date: today
        })
            .select(`
            status
            punchIn
            punchOut
            workSummary
            isSuspicious
            geoLocation.verified
        `)
            .lean();

        /* ======================
           Fallback
        ====================== */

        const status = record?.status || "absent";

        /* ======================
           Response
        ====================== */

        return res.status(200).json({
            success: true,
            date: today,
            status,
            punchIn: record?.punchIn || null,
            punchOut: record?.punchOut || null,
            manual: employee?.manual || null,
            flags: {
                isLate: (record?.workSummary?.lateMinutes || 0) > 0,
                isEarlyLeave: (record?.workSummary?.earlyLeaveMinutes || 0) > 0,
                isOvertime: (record?.workSummary?.overtimeMinutes || 0) > 0,
                isSuspicious: record?.isSuspicious || false,
                geoVerified: record?.geoLocation?.verified || false
            }
        });

    } catch (error) {

        console.error("Today Attendance Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch today attendance"
        });
    }
};


/**
 * @desc Get Attendance By Date
 */
export const getDailyAttendance = async (req, res) => {

    try {

        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: "date is required"
            });
        }

        const userId = req.user._id;
        const companyId = req.user.companyId;

        const employee = await Employee.findOne({
            userId,
            companyId,
            employmentStatus: "active"
        })
            .select("_id")
            .lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        const normalized = normalizeToUTCDate(new Date(date));

        const record = await Attendance.findOne({
            companyId,
            employeeId: employee._id,
            date: normalized
        }).lean();

        return res.status(200).json({

            success: true,

            date: normalized,

            attendance: record || {
                status: "absent",
                punchIn: null,
                punchOut: null
            }
        });

    } catch (error) {

        console.error("Daily Attendance Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch daily attendance"
        });
    }
};



/**
 * @desc Attendance Range Summary
 */

export const getRangeSummary = async (req, res) => {

    try {

        const { from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({
                success: false,
                message: "from and to dates required"
            });
        }

        const userId = req.user._id;
        const companyId = req.user.companyId;

        const employee = await Employee.findOne({
            userId,
            companyId,
            employmentStatus: "active"
        })
            .select("_id salaryStructure")
            .lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        const { start, end } = buildDateRange(from, to);

        const summary = await Attendance.aggregate([

            {
                $match: {
                    companyId: new mongoose.Types.ObjectId(companyId),
                    employeeId: employee._id,
                    date: { $gte: start, $lte: end }
                }
            },

            {
                $group: {

                    _id: "$status",

                    days: { $sum: 1 },

                    totalMinutes: { $sum: "$workSummary.totalMinutes" },

                    overtimeMinutes: { $sum: "$workSummary.overtimeMinutes" }
                }
            }
        ]);

        /* Normalize */

        const stats = {
            present: 0,
            absent: 0,
            leave: 0,
            holiday: 0,
            half_day: 0,
            week_off: 0
        };

        let workMinutes = 0;
        let overtimeMinutes = 0;

        summary.forEach(i => {

            stats[i._id] = i.days;

            workMinutes += i.totalMinutes || 0;

            overtimeMinutes += i.overtimeMinutes || 0;
        });

        return res.status(200).json({

            success: true,

            period: { from, to },

            attendance: stats,

            work: {
                totalMinutes: workMinutes,
                overtimeMinutes,
                totalHours: workMinutes / 60
            }
        });

    } catch (error) {

        console.error("Range Summary Error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to generate summary"
        });
    }
};





/* ======================================================
   EXPORT: Attendance CSV (IST SAFE)
====================================================== */



export const exportAttendanceCSV = async (req, res) => {
    try {
        const companyId = req.user._id;

        moment.tz.setDefault("Asia/Kolkata");

        const { startDate, endDate, month, year } = req.query;

        let fromDateIST;
        let toDateIST;

        /* --------------------------------------------------
           Date Filter (IST)
        -------------------------------------------------- */

        if (month) {
            fromDateIST = moment.tz(month, "YYYY-MM", "Asia/Kolkata").startOf("month");
            toDateIST = moment.tz(month, "YYYY-MM", "Asia/Kolkata").endOf("month");
        } else if (startDate && endDate) {
            fromDateIST = moment.tz(startDate, "YYYY-MM-DD", "Asia/Kolkata").startOf("day");
            toDateIST = moment.tz(endDate, "YYYY-MM-DD", "Asia/Kolkata").endOf("day");
        } else if (year) {
            fromDateIST = moment.tz(`${year}-01-01`, "YYYY-MM-DD", "Asia/Kolkata").startOf("year");
            toDateIST = moment.tz(`${year}-12-31`, "YYYY-MM-DD", "Asia/Kolkata").endOf("year");
        } else {
            return res.status(400).json({
                success: false,
                message: "Provide month OR startDate+endDate OR year",
            });
        }

        const fromUTC = fromDateIST.clone().utc().toDate();
        const toUTC = toDateIST.clone().utc().toDate();

        /* --------------------------------------------------
           Aggregation (Optimized + Sorted)
        -------------------------------------------------- */

        const records = await Attendance.aggregate(
            [
                {
                    $match: {
                        companyId: new mongoose.Types.ObjectId(companyId),
                        date: { $gte: fromUTC, $lte: toUTC },
                    },
                },

                /* Join Employee */
                {
                    $lookup: {
                        from: "employees",
                        let: { empId: "$employeeId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$empId"] } } },
                            {
                                $project: {
                                    user_name: 1,
                                    empCode: 1,
                                    userId: 1,
                                },
                            },
                        ],
                        as: "employee",
                    },
                },
                { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },

                /* Join User */
                {
                    $lookup: {
                        from: "users",
                        let: { uid: "$employee.userId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
                            {
                                $project: {
                                    email: 1,
                                    phone: 1,
                                    name: 1,
                                },
                            },
                        ],
                        as: "user",
                    },
                },
                { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

                /* Flatten */
                {
                    $addFields: {
                        employeeName: "$employee.user_name",
                        employeeCode: "$employee.empCode",
                        employeeEmail: "$user.email",
                        employeePhone: "$user.phone",
                    },
                },

                /* ✅ SORTING (IMPORTANT) */
                {
                    $sort: {
                        employeeCode: 1,
                        date: 1,
                    },
                },

                {
                    $project: {
                        employee: 0,
                        user: 0,
                    },
                },
            ],
            { allowDiskUse: true }
        );

        if (!records.length) {
            return res.status(404).json({
                success: false,
                message: "No attendance data found",
            });
        }

        /* --------------------------------------------------
           Format CSV Data
        -------------------------------------------------- */

        const formattedData = records.map((row) => {
            const isAuto = row.isAutoMarked === true;

            /* Break Calculation */
            const totalBreakMinutes =
                row.breaks?.reduce((acc, b) => {
                    if (b.start && b.end) {
                        const start = moment(b.start).tz("Asia/Kolkata");
                        const end = moment(b.end).tz("Asia/Kolkata");
                        return acc + end.diff(start, "minutes");
                    }
                    return acc;
                }, 0) || 0;

            /* ✅ Correct Work Calculation */
            const totalMinutes = !isAuto
                ? Number(row.workSummary?.totalMinutes || 0)
                : 0;

            const overtime = !isAuto
                ? Number(row.workSummary?.overtimeMinutes || 0)
                : 0;

            const late = !isAuto
                ? Number(row.workSummary?.lateMinutes || 0)
                : 0;

            const earlyLeave = !isAuto
                ? Number(row.workSummary?.earlyLeaveMinutes || 0)
                : 0;

            return {
                EmployeeCode: row.employeeCode || "N/A",
                EmployeeName: row.employeeName || "N/A",
                EmployeeEmail: row.employeeEmail || "N/A",
                EmployeePhone: row.employeePhone || "N/A",

                Date: moment(row.date).tz("Asia/Kolkata").format("DD-MMM-YYYY"),
                Day: moment(row.date).tz("Asia/Kolkata").format("dddd"),
                Month: moment(row.date).tz("Asia/Kolkata").format("MMMM"),
                Year: moment(row.date).tz("Asia/Kolkata").format("YYYY"),

                ShiftName: row.shift?.name || "General",
                ShiftStart: row.shift?.startTime || "",
                ShiftEnd: row.shift?.endTime || "",

                PunchIn: row.punchIn
                    ? moment(row.punchIn).tz("Asia/Kolkata").format("hh:mm A")
                    : "",

                PunchOut: row.punchOut
                    ? moment(row.punchOut).tz("Asia/Kolkata").format("hh:mm A")
                    : "",

                /* ✅ FIXED VALUES */
                TotalWorkMinutes: Number(totalMinutes.toFixed(2)),
                TotalHours: Number((totalMinutes / 60).toFixed(2)),
                OvertimeMinutes: Number(overtime.toFixed(2)),
                LateMinutes: Number(late.toFixed(2)),
                EarlyLeaveMinutes: Number(earlyLeave.toFixed(2)),

                BreakMinutes: totalBreakMinutes,

                Status: row.status,
                LocationVerified: row.geoLocation?.verified ? "Yes" : "No",

                Remarks: row.remarks || "",
                AutoMarked: isAuto ? "Yes" : "No",
                Suspicious: row.isSuspicious ? "Yes" : "No",
            };
        });

        /* --------------------------------------------------
           Convert to CSV
        -------------------------------------------------- */

        const parser = new Parser();
        const csv = parser.parse(formattedData);

        const fileName = `attendance_${fromDateIST.format(
            "YYYYMMDD"
        )}_${toDateIST.format("YYYYMMDD")}.csv`;

        res.header("Content-Type", "text/csv");
        res.header("Content-Disposition", `attachment; filename=${fileName}`);

        return res.status(200).send(csv);
    } catch (error) {
        console.error("CSV Export Error:", error);

        return res.status(500).json({
            success: false,
            message: "CSV Export Failed",
            error: error.message,
        });
    }
};


export const exportCompanyAttendanceToExcel = async (req, res) => {
    try {

        /* ===============================
           1. AUTH & VALIDATION
        =============================== */

        const companyId = req.user._id; // From JWT Middleware

        if (!mongoose.Types.ObjectId.isValid(companyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Company ID"
            });
        }


        /* ===============================
           2. FILTER (Optional Date Range)
        =============================== */

        const { startDate, endDate } = req.query;

        let matchQuery = {
            companyId: new mongoose.Types.ObjectId(companyId)
        };

        if (startDate && endDate) {
            matchQuery.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }


        /* ===============================
           3. FETCH DATA (Optimized)
        =============================== */

        const records = await Attendance.aggregate([

            { $match: matchQuery },

            /* Join Employee */
            {
                $lookup: {
                    from: "employees",
                    localField: "employeeId",
                    foreignField: "_id",
                    as: "employee"
                }
            },

            { $unwind: "$employee" },

            /* Projection (Report Fields) */
            {
                $project: {

                    _id: 0,

                    employeeId: "$employee._id",
                    employeeName: "$employee.name",
                    employeeEmail: "$employee.email",

                    date: 1,

                    punchIn: 1,
                    punchOut: 1,

                    totalMinutes: "$workSummary.totalMinutes",
                    payableMinutes: "$workSummary.payableMinutes",
                    overtimeMinutes: "$workSummary.overtimeMinutes",

                    status: 1,
                    approvalStatus: 1,

                    deviceId: "$deviceInfo.deviceId",

                    createdAt: 1
                }
            },

            { $sort: { date: -1 } }

        ]);


        if (!records || records.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No attendance records found"
            });
        }


        /* ===============================
           4. FORMAT DATA
        =============================== */

        const formattedData = records.map((item) => {

            return {

                Employee_ID: item.employeeId,
                Employee_Name: item.employeeName || "-",
                Employee_Email: item.employeeEmail || "-",

                Date: formatDate(item.date),

                Punch_In: formatTime(item.punchIn),
                Punch_Out: formatTime(item.punchOut),

                Total_Minutes: item.totalMinutes || 0,
                Payable_Minutes: item.payableMinutes || 0,
                Overtime_Minutes: item.overtimeMinutes || 0,

                Status: item.status,
                Approval_Status: item.approvalStatus,

                Device_ID: item.deviceId || "-",

                Created_At: formatDateTime(item.createdAt)
            };
        });


        /* ===============================
           5. JSON → CSV
        =============================== */

        const fields = Object.keys(formattedData[0]);

        const json2csvParser = new Parser({ fields });

        const csv = json2csvParser.parse(formattedData);


        /* ===============================
           6. DOWNLOAD RESPONSE
        =============================== */

        const fileName = `attendance_report_${Date.now()}.csv`;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
        );

        return res.status(200).send(csv);

    }
    catch (error) {

        console.error("Attendance Export Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to export attendance",
            error: error.message
        });
    }
};



// /* =====================================================
//    HELPERS
// ===================================================== */

// const formatDate = (date) => {
//     if (!date) return "-";

//     return new Date(date).toLocaleDateString("en-IN");
// };




// const formatDateTime = (date) => {
//     if (!date) return "-";

//     return new Date(date).toLocaleString("en-IN");
// };






// const resolveCompanyId = (req) => {
//     let id = req.user._id || req.user?.id;
//     if ((req.user?.role || req.user?.type) === "user") id = req.user?.companyId;
//     return id;
// };



// const buildAttendanceMap = (records) => {
//     const map = new Map();
//     records.forEach((r) => {
//         map.set(`${r.employeeId}_${r.date.toISOString().split("T")[0]}`, r);
//     });
//     return map;
// };

// /** Returns { code, label, punchIn, punchOut, hours } for one day */
// const resolveDayStatus = (attendance, isWeeklyOff, shiftStart = "09:00", shiftEnd = "18:00", graceIn = 10, graceOut = 10) => {
//     if (isWeeklyOff) return { code: "WO", label: "Week Off", punchIn: "—", punchOut: "—", hours: "0.00" };
//     if (!attendance) return { code: "A", label: "Absent", punchIn: "—", punchOut: "—", hours: "0.00" };

//     const pi = formatTime(attendance.punchIn);
//     const po = formatTime(attendance.punchOut);
//     const hrs = ((attendance.workSummary?.totalMinutes || 0) / 60).toFixed(2);

//     switch (attendance.status) {
//         case "leave": return { code: "L", label: "Leave", punchIn: "—", punchOut: "—", hours: "0.00" };
//         case "holiday": return { code: "H", label: "Holiday", punchIn: "—", punchOut: "—", hours: "0.00" };
//         case "week_off": return { code: "WO", label: "Week Off", punchIn: "—", punchOut: "—", hours: "0.00" };
//         case "half_day": return { code: "HD", label: "Half Day", punchIn: pi || "—", punchOut: po || "—", hours: hrs };
//         case "absent": return { code: "A", label: "Absent", punchIn: "—", punchOut: "—", hours: "0.00" };
//         default: {
//             // Present – detect late / early leave
//             let tag = "P";
//             if (pi) {
//                 const inMin = timeStrToMinutes(pi);
//                 if (inMin - timeStrToMinutes(shiftStart) > graceIn) tag = "PL"; // Present Late
//             }
//             if (po) {
//                 const outMin = timeStrToMinutes(po);
//                 const shiftOut = timeStrToMinutes(shiftEnd);
//                 if (shiftOut - outMin > graceOut) tag = tag === "PL" ? "PLE" : "PE"; // Early Exit
//             }
//             const labels = { P: "Present", PL: "Late", PE: "Early Exit", PLE: "Late+Early" };
//             return { code: tag, label: labels[tag] || "Present", punchIn: pi || "—", punchOut: po || "—", hours: hrs };
//         }
//     }
// };

// /* Status colour palette */
// const STATUS_FILL = {
//     P: "FFD9EAD3", // green
//     PL: "FFFFFF99", // yellow
//     PE: "FFFCE5CD", // orange
//     PLE: "FFFFD966", // amber
//     HD: "FFFFE599", // light yellow
//     A: "FFFFC7CE", // red
//     L: "FFD9D2E9", // lavender
//     WO: "FFD0E4F7", // blue
//     H: "FFB7E1CD", // teal-green
// };
// const STATUS_FONT = {
//     A: "FF9C0006", L: "FF6A0DAD", WO: "FF1155CC", H: "FF137333",
//     PL: "FF7D6608", PE: "FF7D4604", PLE: "FF7D4604",
// };

// const HEADER_BG = "FF1F3864"; // dark navy
// const SUBHEAD_BG = "FF2F5496"; // medium blue
// const ALT_ROW_BG = "FFF2F6FC";

// /* ─────────────────────────────────────────
//    MATRIX EXPORT
//    One row per employee, dates as columns.
//    Each cell shows: IN / OUT / HRS / CODE
// ───────────────────────────────────────── */

// export const generateAttendanceMatrixCSV = async (req, res) => {
//     try {
//         const { startDate, endDate, department, employeeCode } = req.query;
//         const companyId = resolveCompanyId(req);

//         if (!companyId || !startDate || !endDate)
//             return res.status(400).json({ success: false, message: "companyId, startDate, and endDate are required" });

//         const start = new Date(startDate);
//         const end = new Date(endDate);
//         end.setHours(23, 59, 59, 999);

//         const empFilter = { companyId, employmentStatus: "active" };
//         if (department) empFilter["jobInfo.department"] = department;
//         if (employeeCode) empFilter.empCode = employeeCode;

//         const employees = await Employee.find(empFilter).populate("shift").lean();
//         if (!employees.length)
//             return res.status(404).json({ success: false, message: "No employees found" });

//         const attendanceRecords = await Attendance.find({
//             companyId,
//             employeeId: { $in: employees.map((e) => e._id) },
//             date: { $gte: start, $lte: end },
//         }).lean();

//         const attMap = buildAttendanceMap(attendanceRecords);
//         const dateRange = buildDateRange(start, end);

//         /* ── Workbook ── */
//         const wb = new ExcelJS.Workbook();
//         wb.creator = "HR System";
//         wb.created = new Date();

//         /* ══════════════════════════════
//            SHEET 1 – MATRIX (PIVOT)
//         ══════════════════════════════ */
//         const ws = wb.addWorksheet("Attendance Matrix", {
//             views: [{ state: "frozen", xSplit: 4, ySplit: 3 }],
//         });

//         // ── Row 1: Title ──
//         ws.mergeCells(1, 1, 1, 4 + dateRange.length);
//         const titleCell = ws.getCell(1, 1);
//         titleCell.value = `ATTENDANCE MATRIX REPORT  |  ${startDate}  to  ${endDate}`;
//         titleCell.font = { name: "Arial", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
//         titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
//         titleCell.alignment = { horizontal: "center", vertical: "middle" };
//         ws.getRow(1).height = 28;

//         // ── Row 2: Date sub-headers ──
//         const dateRow = ws.getRow(2);
//         ["#", "Emp Code", "Emp Name", "Department"].forEach((h, i) => {
//             const c = dateRow.getCell(i + 1);
//             c.value = h;
//             c.font = { name: "Arial", bold: true, size: 9, color: { argb: "FFFFFFFF" } };
//             c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEAD_BG } };
//             c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
//         });
//         dateRange.forEach((date, i) => {
//             const c = dateRow.getCell(5 + i);
//             const day = date.toLocaleDateString("en-IN", { weekday: "short" });
//             const dd = date.getDate().toString().padStart(2, "0");
//             const mon = date.toLocaleDateString("en-IN", { month: "short" });
//             c.value = `${dd}\n${mon}\n${day}`;
//             c.font = { name: "Arial", bold: true, size: 8, color: { argb: "FFFFFFFF" } };
//             c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEAD_BG } };
//             c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
//         });
//         dateRow.height = 40;

//         // ── Row 3: Legend ──
//         const legendRow = ws.getRow(3);
//         const legends = [
//             { code: "P", label: "Present" }, { code: "PL", label: "Late" },
//             { code: "PE", label: "Early Exit" }, { code: "HD", label: "Half Day" },
//             { code: "A", label: "Absent" }, { code: "L", label: "Leave" },
//             { code: "WO", label: "Week Off" }, { code: "H", label: "Holiday" },
//         ];
//         legendRow.getCell(1).value = "LEGEND →";
//         legendRow.getCell(1).font = { name: "Arial", bold: true, size: 8 };
//         legendRow.getCell(1).alignment = { horizontal: "center" };
//         legends.forEach((lg, i) => {
//             const c = legendRow.getCell(2 + i);
//             c.value = `${lg.code} = ${lg.label}`;
//             c.font = { name: "Arial", size: 8, bold: true, color: { argb: STATUS_FONT[lg.code] || "FF000000" } };
//             c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[lg.code] || "FFFFFFFF" } };
//             c.alignment = { horizontal: "center", vertical: "middle" };
//         });
//         legendRow.height = 16;

//         // ── Fixed columns widths ──
//         ws.getColumn(1).width = 5;
//         ws.getColumn(2).width = 12;
//         ws.getColumn(3).width = 22;
//         ws.getColumn(4).width = 18;
//         dateRange.forEach((_, i) => { ws.getColumn(5 + i).width = 9; });

//         // ── Data rows ──
//         employees.forEach((emp, empIdx) => {
//             const weeklyOff = emp.weeklyOff?.length ? emp.weeklyOff : ["Sunday"];
//             const shiftStart = emp.shift?.startTime || "09:00";
//             const shiftEnd = emp.shift?.endTime || "18:00";
//             const graceIn = emp.shift?.gracePeriod?.lateEntry ?? 10;
//             const graceOut = emp.shift?.gracePeriod?.earlyExit ?? 10;

//             const dataRow = ws.addRow([]);
//             const rowNum = dataRow.number;
//             const isAlt = empIdx % 2 === 0;

//             dataRow.height = 20;

//             // Fixed cells
//             const fixedVals = [
//                 empIdx + 1,
//                 emp.empCode || "—",
//                 emp.user_name || "N/A",
//                 emp.jobInfo?.department || "N/A",
//             ];
//             fixedVals.forEach((val, ci) => {
//                 const cell = ws.getCell(rowNum, ci + 1);
//                 cell.value = val;
//                 cell.font = { name: "Arial", size: 9, bold: ci <= 1 };
//                 cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? ALT_ROW_BG : "FFFFFFFF" } };
//                 cell.alignment = { horizontal: ci === 2 ? "left" : "center", vertical: "middle" };
//                 cell.border = { right: { style: "thin", color: { argb: "FFCCCCCC" } } };
//             });

//             // Date cells
//             dateRange.forEach((date, di) => {
//                 const dateKey = date.toISOString().split("T")[0];
//                 const dayName = date.toLocaleDateString("en-IN", { weekday: "long" });
//                 const att = attMap.get(`${emp._id}_${dateKey}`);
//                 const isWO = weeklyOff.includes(dayName);

//                 const { code, label, punchIn, punchOut, hours } = resolveDayStatus(att, isWO, shiftStart, shiftEnd, graceIn, graceOut);

//                 const cell = ws.getCell(rowNum, 5 + di);
//                 // Show: code on top, then IN/OUT below
//                 cell.value = code;
//                 cell.font = {
//                     name: "Arial", size: 9, bold: true,
//                     color: { argb: STATUS_FONT[code] || "FF000000" },
//                 };
//                 cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[code] || "FFFFFFFF" } };
//                 cell.alignment = { horizontal: "center", vertical: "middle" };
//                 // Add tooltip via comment
//                 cell.note = {
//                     texts: [
//                         { font: { bold: true, size: 9 }, text: `${label}\n` },
//                         { font: { size: 9 }, text: `In:  ${punchIn}\nOut: ${punchOut}\nHrs: ${hours}` },
//                     ],
//                 };
//                 cell.border = {
//                     top: { style: "hair", color: { argb: "FFCCCCCC" } },
//                     left: { style: "hair", color: { argb: "FFCCCCCC" } },
//                     bottom: { style: "hair", color: { argb: "FFCCCCCC" } },
//                     right: { style: "hair", color: { argb: "FFCCCCCC" } },
//                 };
//             });
//         });

//         // ── Auto filter row 2 cols 1-4 ──
//         ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 4 } };

//         /* ══════════════════════════════
//            SHEET 2 – DETAIL (punch times)
//            Flat list with all details
//         ══════════════════════════════ */
//         const wsDetail = wb.addWorksheet("Daily Detail");
//         wsDetail.views = [{ state: "frozen", ySplit: 2 }];

//         wsDetail.mergeCells(1, 1, 1, 12);
//         const dTitleCell = wsDetail.getCell(1, 1);
//         dTitleCell.value = `DAILY DETAIL  |  ${startDate}  to  ${endDate}`;
//         dTitleCell.font = { name: "Arial", bold: true, size: 13, color: { argb: "FFFFFFFF" } };
//         dTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
//         dTitleCell.alignment = { horizontal: "center", vertical: "middle" };
//         wsDetail.getRow(1).height = 24;

//         const detailHeaders = ["#", "Emp Code", "Emp Name", "Department", "Shift", "Date", "Day", "Punch In", "Punch Out", "Total Hrs", "Status", "Remarks"];
//         const dHeaderRow = wsDetail.getRow(2);
//         detailHeaders.forEach((h, i) => {
//             const c = dHeaderRow.getCell(i + 1);
//             c.value = h;
//             c.font = { name: "Arial", bold: true, size: 9, color: { argb: "FFFFFFFF" } };
//             c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEAD_BG } };
//             c.alignment = { horizontal: "center", vertical: "middle" };
//         });
//         dHeaderRow.height = 18;

//         wsDetail.columns = [
//             { width: 5 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 20 },
//             { width: 13 }, { width: 11 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 25 },
//         ];

//         let detailRowNum = 3;
//         let seq = 1;
//         for (const emp of employees) {
//             const weeklyOff = emp.weeklyOff?.length ? emp.weeklyOff : ["Sunday"];
//             const shiftStart = emp.shift?.startTime || "09:00";
//             const shiftEnd = emp.shift?.endTime || "18:00";
//             const graceIn = emp.shift?.gracePeriod?.lateEntry ?? 10;
//             const graceOut = emp.shift?.gracePeriod?.earlyExit ?? 10;
//             const shiftName = emp.shift?.shiftName || `Default (${shiftStart}–${shiftEnd})`;

//             for (const date of dateRange) {
//                 const dateKey = date.toISOString().split("T")[0];
//                 const dayName = date.toLocaleDateString("en-IN", { weekday: "long" });
//                 const att = attMap.get(`${emp._id}_${dateKey}`);
//                 const isWO = weeklyOff.includes(dayName);
//                 const { code, label, punchIn, punchOut, hours } = resolveDayStatus(att, isWO, shiftStart, shiftEnd, graceIn, graceOut);

//                 const row = wsDetail.getRow(detailRowNum++);
//                 row.height = 15;
//                 const isAlt = seq % 2 === 0;
//                 const vals = [seq++, emp.empCode || "—", emp.user_name || "N/A", emp.jobInfo?.department || "N/A",
//                     shiftName, dateKey, dayName.slice(0, 3), punchIn, punchOut, hours, label, att?.remarks || ""];
//                 vals.forEach((v, i) => {
//                     const c = row.getCell(i + 1);
//                     c.value = v;
//                     c.font = { name: "Arial", size: 9 };
//                     c.alignment = { horizontal: i <= 1 || i >= 5 ? "center" : "left", vertical: "middle" };
//                     c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? ALT_ROW_BG : "FFFFFFFF" } };
//                 });
//                 // Status cell colour
//                 const statusCell = row.getCell(11);
//                 statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[code] || "FFFFFFFF" } };
//                 statusCell.font = { name: "Arial", size: 9, bold: true, color: { argb: STATUS_FONT[code] || "FF000000" } };
//                 statusCell.alignment = { horizontal: "center", vertical: "middle" };
//             }
//         }
//         wsDetail.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 12 } };

//         /* ── Send ── */
//         res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//         res.setHeader("Content-Disposition", `attachment; filename=attendance_matrix_${startDate}_to_${endDate}.xlsx`);
//         await wb.xlsx.write(res);
//         return res.end();

//     } catch (err) {
//         console.error("Matrix export error:", err);
//         return res.status(500).json({ success: false, message: "Failed to generate matrix report", error: err.message });
//     }
// };


/* =====================================================
   HELPERS - FIXED VERSION
===================================================== */

const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-IN");
};

const formatDateTime = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("en-IN");
};

// Helper to format minutes to hh:mm
const formatHoursToHHMM = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return "00:00";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// Helper to format time string with AM/PM
const formatTimeWithAMPM = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
    });
};

// Convert time string to minutes considering AM/PM
const timeStrToMinutes12Hour = (timeStr) => {
    if (!timeStr) return 0;
    
    // If time already has AM/PM
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
        const [time, period] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        return hours * 60 + minutes;
    }
    
    // If time is in 24hr format (e.g., "18:00")
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

const resolveCompanyId = (req) => {
    let id = req.user._id || req.user?.id;
    if ((req.user?.role || req.user?.type) === "user") id = req.user?.companyId;
    return id;
};

const buildAttendanceMap = (records) => {
    const map = new Map();
    records.forEach((r) => {
        map.set(`${r.employeeId}_${r.date.toISOString().split("T")[0]}`, r);
    });
    return map;
};

// FIXED: Format time with AM/PM
const formatTime = (date) => {
    if (!date) return null;
    return formatTimeWithAMPM(date);
};

/** Returns { code, label, punchIn, punchOut, hours } for one day - FIXED VERSION */
const resolveDayStatus = (attendance, isWeeklyOff, shiftStart = "09:00 AM", shiftEnd = "06:00 PM", graceIn = 10, graceOut = 10) => {
    // REMOVE WEEK OFF - treat as regular day with no attendance
    // Commented out week off handling - now shows as absent if no attendance
    // if (isWeeklyOff) return { code: "WO", label: "Week Off", punchIn: "—", punchOut: "—", hours: "00:00" };
    
    if (!attendance) return { code: "A", label: "Absent", punchIn: "—", punchOut: "—", hours: "00:00" };

    const pi = formatTime(attendance.punchIn);
    const po = formatTime(attendance.punchOut);
    const totalMinutes = attendance.workSummary?.totalMinutes || 0;
    const hrs = formatHoursToHHMM(totalMinutes);

    switch (attendance.status) {
        case "leave": return { code: "L", label: "Leave", punchIn: "—", punchOut: "—", hours: "00:00" };
        case "holiday": return { code: "H", label: "Holiday", punchIn: "—", punchOut: "—", hours: "00:00" };
        case "week_off": return { code: "A", label: "Absent", punchIn: "—", punchOut: "—", hours: "00:00" }; // Treat week off as absent
        case "half_day": return { code: "HD", label: "Half Day", punchIn: pi || "—", punchOut: po || "—", hours: hrs };
        case "absent": return { code: "A", label: "Absent", punchIn: "—", punchOut: "—", hours: "00:00" };
        default: {
            // Present – detect late / early leave
            let tag = "P";
            if (pi) {
                const inMin = timeStrToMinutes12Hour(pi);
                const shiftInMin = timeStrToMinutes12Hour(shiftStart);
                if (inMin - shiftInMin > graceIn) tag = "PL"; // Present Late
            }
            if (po) {
                const outMin = timeStrToMinutes12Hour(po);
                const shiftOutMin = timeStrToMinutes12Hour(shiftEnd);
                if (shiftOutMin - outMin > graceOut) tag = tag === "PL" ? "PLE" : "PE"; // Early Exit
            }
            const labels = { P: "Present", PL: "Late", PE: "Early Exit", PLE: "Late+Early" };
            return { code: tag, label: labels[tag] || "Present", punchIn: pi || "—", punchOut: po || "—", hours: hrs };
        }
    }
};

/* Status colour palette */
const STATUS_FILL = {
    P: "FFD9EAD3", // green
    PL: "FFFFFF99", // yellow
    PE: "FFFCE5CD", // orange
    PLE: "FFFFD966", // amber
    HD: "FFFFE599", // light yellow
    A: "FFFFC7CE", // red
    L: "FFD9D2E9", // lavender
    WO: "FFD0E4F7", // blue
    H: "FFB7E1CD", // teal-green
};

const STATUS_FONT = {
    A: "FF9C0006", L: "FF6A0DAD", WO: "FF1155CC", H: "FF137333",
    PL: "FF7D6608", PE: "FF7D4604", PLE: "FF7D4604",
};

const HEADER_BG = "FF1F3864"; // dark navy
const SUBHEAD_BG = "FF2F5496"; // medium blue
const ALT_ROW_BG = "FFF2F6FC";

// Helper to build date range
// const buildDateRange = (start, end) => {
//     const dates = [];
//     const current = new Date(start);
//     while (current <= end) {
//         dates.push(new Date(current));
//         current.setDate(current.getDate() + 1);
//     }
//     return dates;
// };

/* ─────────────────────────────────────────
   MATRIX EXPORT - FIXED VERSION
   One row per employee, dates as columns.
   Each cell shows: IN / OUT / HRS / CODE
───────────────────────────────────────── */

export const generateAttendanceMatrixCSV = async (req, res) => {
    try {
        const { startDate, endDate, department, employeeCode } = req.query;
        const companyId = resolveCompanyId(req);

        if (!companyId || !startDate || !endDate)
            return res.status(400).json({ success: false, message: "companyId, startDate, and endDate are required" });

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const empFilter = { companyId, employmentStatus: "active" };
        if (department) empFilter["jobInfo.department"] = department;
        if (employeeCode) empFilter.empCode = employeeCode;

        const employees = await Employee.find(empFilter).populate("shift").lean();
        if (!employees.length)
            return res.status(404).json({ success: false, message: "No employees found" });

        const attendanceRecords = await Attendance.find({
            companyId,
            employeeId: { $in: employees.map((e) => e._id) },
            date: { $gte: start, $lte: end },
        }).lean();

        const attMap = buildAttendanceMap(attendanceRecords);
        const dateRange = buildDateRange(start, end);

        /* ── Workbook ── */
        const wb = new ExcelJS.Workbook();
        wb.creator = "HR System";
        wb.created = new Date();

        /* ══════════════════════════════
           SHEET 1 – MATRIX (PIVOT)
        ══════════════════════════════ */
        const ws = wb.addWorksheet("Attendance Matrix", {
            views: [{ state: "frozen", xSplit: 4, ySplit: 3 }],
        });

        // ── Row 1: Title ──
        ws.mergeCells(1, 1, 1, 4 + dateRange.length);
        const titleCell = ws.getCell(1, 1);
        titleCell.value = `ATTENDANCE MATRIX REPORT  |  ${startDate}  to  ${endDate}`;
        titleCell.font = { name: "Arial", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        ws.getRow(1).height = 28;

        // ── Row 2: Date sub-headers ──
        const dateRow = ws.getRow(2);
        ["#", "Emp Code", "Emp Name", "Department"].forEach((h, i) => {
            const c = dateRow.getCell(i + 1);
            c.value = h;
            c.font = { name: "Arial", bold: true, size: 9, color: { argb: "FFFFFFFF" } };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEAD_BG } };
            c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        });
        
        dateRange.forEach((date, i) => {
            const c = dateRow.getCell(5 + i);
            const day = date.toLocaleDateString("en-IN", { weekday: "short" });
            const dd = date.getDate().toString().padStart(2, "0");
            const mon = date.toLocaleDateString("en-IN", { month: "short" });
            c.value = `${dd}\n${mon}\n${day}`;
            c.font = { name: "Arial", bold: true, size: 8, color: { argb: "FFFFFFFF" } };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEAD_BG } };
            c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        });
        dateRow.height = 40;

        // ── Row 3: Legend (Removed WO - Week Off) ──
        const legendRow = ws.getRow(3);
        const legends = [
            { code: "P", label: "Present" }, { code: "PL", label: "Late" },
            { code: "PE", label: "Early Exit" }, { code: "HD", label: "Half Day" },
            { code: "A", label: "Absent" }, { code: "L", label: "Leave" },
            { code: "H", label: "Holiday" },
        ];
        legendRow.getCell(1).value = "LEGEND →";
        legendRow.getCell(1).font = { name: "Arial", bold: true, size: 8 };
        legendRow.getCell(1).alignment = { horizontal: "center" };
        legends.forEach((lg, i) => {
            const c = legendRow.getCell(2 + i);
            c.value = `${lg.code} = ${lg.label}`;
            c.font = { name: "Arial", size: 8, bold: true, color: { argb: STATUS_FONT[lg.code] || "FF000000" } };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[lg.code] || "FFFFFFFF" } };
            c.alignment = { horizontal: "center", vertical: "middle" };
        });
        legendRow.height = 16;

        // ── Fixed columns widths ──
        ws.getColumn(1).width = 5;
        ws.getColumn(2).width = 12;
        ws.getColumn(3).width = 22;
        ws.getColumn(4).width = 18;
        dateRange.forEach((_, i) => { ws.getColumn(5 + i).width = 12; }); // Increased width for AM/PM time

        // ── Data rows ──
        employees.forEach((emp, empIdx) => {
            // Removed weeklyOff check - shiftStart/End now in 12hr format
            const shiftStart = emp.shift?.startTime ? 
                formatTimeWithAMPM(new Date(`2024-01-01 ${emp.shift.startTime}`)) : "09:00 AM";
            const shiftEnd = emp.shift?.endTime ? 
                formatTimeWithAMPM(new Date(`2024-01-01 ${emp.shift.endTime}`)) : "06:00 PM";
            const graceIn = emp.shift?.gracePeriod?.lateEntry ?? 10;
            const graceOut = emp.shift?.gracePeriod?.earlyExit ?? 10;

            const dataRow = ws.addRow([]);
            const rowNum = dataRow.number;
            const isAlt = empIdx % 2 === 0;

            dataRow.height = 20;
            if (isAlt) {
                dataRow.eachCell((cell) => {
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_BG } };
                });
            }

            // Fixed cells
            const fixedVals = [
                empIdx + 1,
                emp.empCode || "—",
                emp.user_name || "N/A",
                emp.jobInfo?.department || "N/A",
            ];
            fixedVals.forEach((val, ci) => {
                const cell = ws.getCell(rowNum, ci + 1);
                cell.value = val;
                cell.font = { name: "Arial", size: 9, bold: ci <= 1 };
                cell.alignment = { horizontal: ci === 2 ? "left" : "center", vertical: "middle" };
                cell.border = { right: { style: "thin", color: { argb: "FFCCCCCC" } } };
            });

            // Date cells
            dateRange.forEach((date, di) => {
                const dateKey = date.toISOString().split("T")[0];
                const att = attMap.get(`${emp._id}_${dateKey}`);
                
                // Ignore week off - pass false for isWeeklyOff
                const { code, label, punchIn, punchOut, hours } = resolveDayStatus(
                    att, false, shiftStart, shiftEnd, graceIn, graceOut
                );

                const cell = ws.getCell(rowNum, 5 + di);
                // Show: IN / OUT / HRS with AM/PM format
                cell.value = {
                    richText: [
                        { font: { bold: true, size: 7, color: { argb: STATUS_FONT[code] || "FF000000" } }, text: `${code}\n` },
                        { font: { size: 7 }, text: `${punchIn}\n${punchOut}\n${hours}` }
                    ]
                };
                cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                
                // Tooltip with details
                cell.note = {
                    texts: [
                        { font: { bold: true, size: 9 }, text: `${label}\n` },
                        { font: { size: 9 }, text: `In:  ${punchIn}\nOut: ${punchOut}\nHrs: ${hours}` },
                    ],
                };
                
                // Cell styling
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[code] || "FFFFFFFF" } };
                cell.border = {
                    top: { style: "hair", color: { argb: "FFCCCCCC" } },
                    left: { style: "hair", color: { argb: "FFCCCCCC" } },
                    bottom: { style: "hair", color: { argb: "FFCCCCCC" } },
                    right: { style: "hair", color: { argb: "FFCCCCCC" } },
                };
            });
        });

        // ── Auto filter row 2 cols 1-4 ──
        ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 4 } };

        /* ══════════════════════════════
           SHEET 2 – DETAIL (punch times) - FIXED
        ══════════════════════════════ */
        const wsDetail = wb.addWorksheet("Daily Detail");
        wsDetail.views = [{ state: "frozen", ySplit: 2 }];

        wsDetail.mergeCells(1, 1, 1, 12);
        const dTitleCell = wsDetail.getCell(1, 1);
        dTitleCell.value = `DAILY DETAIL  |  ${startDate}  to  ${endDate}`;
        dTitleCell.font = { name: "Arial", bold: true, size: 13, color: { argb: "FFFFFFFF" } };
        dTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
        dTitleCell.alignment = { horizontal: "center", vertical: "middle" };
        wsDetail.getRow(1).height = 24;

        const detailHeaders = ["#", "Emp Code", "Emp Name", "Department", "Shift", "Date", "Day", "Punch In", "Punch Out", "Total Hrs", "Status", "Remarks"];
        const dHeaderRow = wsDetail.getRow(2);
        detailHeaders.forEach((h, i) => {
            const c = dHeaderRow.getCell(i + 1);
            c.value = h;
            c.font = { name: "Arial", bold: true, size: 9, color: { argb: "FFFFFFFF" } };
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEAD_BG } };
            c.alignment = { horizontal: "center", vertical: "middle" };
        });
        dHeaderRow.height = 18;

        wsDetail.columns = [
            { width: 5 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 20 },
            { width: 13 }, { width: 11 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 25 },
        ];

        let detailRowNum = 3;
        let seq = 1;
        for (const emp of employees) {
            const shiftStart = emp.shift?.startTime ? 
                formatTimeWithAMPM(new Date(`2024-01-01 ${emp.shift.startTime}`)) : "09:00 AM";
            const shiftEnd = emp.shift?.endTime ? 
                formatTimeWithAMPM(new Date(`2024-01-01 ${emp.shift.endTime}`)) : "06:00 PM";
            const graceIn = emp.shift?.gracePeriod?.lateEntry ?? 10;
            const graceOut = emp.shift?.gracePeriod?.earlyExit ?? 10;
            const shiftName = emp.shift?.shiftName || `Default (${shiftStart}–${shiftEnd})`;

            for (const date of dateRange) {
                const dateKey = date.toISOString().split("T")[0];
                const dayName = date.toLocaleDateString("en-IN", { weekday: "long" });
                const att = attMap.get(`${emp._id}_${dateKey}`);
                const { code, label, punchIn, punchOut, hours } = resolveDayStatus(
                    att, false, shiftStart, shiftEnd, graceIn, graceOut
                );

                const row = wsDetail.getRow(detailRowNum++);
                row.height = 15;
                const isAlt = seq % 2 === 0;
                const vals = [seq++, emp.empCode || "—", emp.user_name || "N/A", emp.jobInfo?.department || "N/A",
                    shiftName, dateKey, dayName.slice(0, 3), punchIn, punchOut, hours, label, att?.remarks || ""];
                
                vals.forEach((v, i) => {
                    const c = row.getCell(i + 1);
                    c.value = v;
                    c.font = { name: "Arial", size: 9 };
                    c.alignment = { horizontal: i <= 1 || i >= 5 ? "center" : "left", vertical: "middle" };
                    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? ALT_ROW_BG : "FFFFFFFF" } };
                });
                
                // Status cell colour
                const statusCell = row.getCell(11);
                statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[code] || "FFFFFFFF" } };
                statusCell.font = { name: "Arial", size: 9, bold: true, color: { argb: STATUS_FONT[code] || "FF000000" } };
                statusCell.alignment = { horizontal: "center", vertical: "middle" };
            }
        }
        wsDetail.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 12 } };

        /* ── Send ── */
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=attendance_matrix_${startDate}_to_${endDate}.xlsx`);
        await wb.xlsx.write(res);
        return res.end();

    } catch (err) {
        console.error("Matrix export error:", err);
        return res.status(500).json({ success: false, message: "Failed to generate matrix report", error: err.message });
    }
};