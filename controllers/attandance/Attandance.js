import Employee from "../../models/Attandance/Employee.js";
// import Employee from "../../models/Attandance/Employee.js";
import Attendance from "../../models/Attandance/Attendance.js";
import Holiday from "../../models/Attandance/Holiday.js";
import Payroll from "../../models/Attandance/Payroll.js";
import mongoose from "mongoose";
import { normalizeToUTCDate, buildDateRange } from "./utils/date.utils.js";
import { Parser } from "json2csv";
// import moment from "moment";
import moment from "moment-timezone";

import jwt from "jsonwebtoken";
import User from "../../models/userModel.js";

// utils/dateRange.js

export const buildMonthRange = (year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    return { start, end };
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

/* =====================================================
   MARK ATTENDANCE CONTROLLER
===================================================== */

// export const markAttendance = async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         /* --------------------------------
//            1. Extract Auth + Body
//         -------------------------------- */

//         const u_id = req.user._id;

//         const {
//             date,
//             punchIn,
//             punchOut,
//             breaks,
//             geoLocation,
//             deviceInfo,
//             shift,
//             remarks,
//             token
//         } = req.body;


//         if (!token) {
//             return res.status(401).json({
//                 message: "Attendance token is required"
//             });

//         }


//         if (!date || !punchIn || !geoLocation?.coordinates) {
//             return res.status(400).json({
//                 message: "date, punchIn, and geoLocation required"
//             });
//         }

//         // 2) Verify token

//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         if (!decoded || !decoded.userId) {
//             return res.status(401).json({ message: 'Invalid or expired token' });
//         }

//         // 3) Fetch user from DB
//         const user = await User.findById(decoded.userId).select('-password -otp -__v');
//         if (!user) {
//             return res.status(401).json({ message: 'User not found, authorization denied' });
//         }

//         const companyId = user?._id; // from JWT



//         const attendanceDate = normalizeDate(date);

//         /* --------------------------------
//            2. Validate Employee
//         -------------------------------- */

//         const employee = await Employee.findOne({
//             userId: u_id,
//             employmentStatus: "active"
//         }).session(session);

//         if (!employee) {
//             return res.status(404).json({
//                 message: "Active employee not found"
//             });
//         }


//         if (employee.companyId.toString() !== companyId.toString()) {
//             return res.status(403).json({
//                 message: "Unauthorized company access"
//             });
//         }


//         /* --------------------------------
//            3. Prevent Duplicate Entry
//         -------------------------------- */

//         const existing = await Attendance.findOne({
//             companyId,
//             employeeId: employee._id,
//             date: attendanceDate
//         }).session(session);

//         if (existing) {
//             return res.status(409).json({
//                 message: "Attendance already marked"
//             });
//         }

//         /* --------------------------------
//            4. Check Holiday
//         -------------------------------- */

//         const holiday = await Holiday.findOne({
//             companyId,
//             date: attendanceDate
//         }).session(session);

//         let status = "present";

//         if (holiday) {
//             status = "holiday";
//         }

//         /* --------------------------------
//            5. Geo-Fencing Validation
//         -------------------------------- */

//         let geoVerified = false;
//         let suspicious = false;

//         if (employee.officeLocation?.coordinates?.length === 2) {
//             const [officeLng, officeLat] = employee.officeLocation.coordinates;
//             const [userLng, userLat] = geoLocation.coordinates;

//             const distance = getDistance(
//                 officeLat,
//                 officeLng,
//                 userLat,
//                 userLng
//             );

//             if (distance <= employee.officeLocation.radius) {
//                 geoVerified = true;
//             } else {
//                 suspicious = true;
//             }
//         }

//         /* --------------------------------
//            6. Work Calculation
//         -------------------------------- */

//         let totalMinutes = 0;
//         let overtimeMinutes = 0;
//         let lateMinutes = 0;
//         let earlyLeaveMinutes = 0;

//         const inTime = new Date(punchIn);
//         const outTime = punchOut ? new Date(punchOut) : null;

//         if (outTime) {
//             totalMinutes = diffMinutes(inTime, outTime);
//         }

//         /* ------ Break Deduction ------ */

//         if (breaks?.length) {
//             for (const b of breaks) {
//                 if (b.start && b.end) {
//                     totalMinutes -= diffMinutes(
//                         new Date(b.start),
//                         new Date(b.end)
//                     );
//                 }
//             }
//         }

//         /* ------ Shift Logic ------ */

//         if (shift?.startTime && shift?.endTime) {
//             const shiftStart = new Date(
//                 `${attendanceDate.toISOString().split("T")[0]}T${shift.startTime}:00`
//             );

//             const shiftEnd = new Date(
//                 `${attendanceDate.toISOString().split("T")[0]}T${shift.endTime}:00`
//             );

//             // Late
//             if (inTime > shiftStart) {
//                 lateMinutes = diffMinutes(shiftStart, inTime);
//             }

//             // Early leave
//             if (outTime && outTime < shiftEnd) {
//                 earlyLeaveMinutes = diffMinutes(outTime, shiftEnd);
//             }

//             // Overtime
//             if (outTime && outTime > shiftEnd) {
//                 overtimeMinutes = diffMinutes(shiftEnd, outTime);
//             }
//         }

//         /* --------------------------------
//            7. Half Day Logic
//         -------------------------------- */

//         if (totalMinutes < 240 && status === "present") {
//             status = "half_day";
//         }

//         if (!outTime && status === "present") {
//             suspicious = true;
//         }

//         /* --------------------------------
//            8. Save Attendance
//         -------------------------------- */

//         const attendance = new Attendance({
//             companyId,
//             employeeId: employee._id,

//             date: attendanceDate,

//             punchIn: inTime,
//             punchOut: outTime,

//             breaks,

//             shift,

//             status,

//             geoLocation: {
//                 ...geoLocation,
//                 verified: geoVerified
//             },

//             deviceInfo,

//             workSummary: {
//                 totalMinutes,
//                 overtimeMinutes,
//                 lateMinutes,
//                 earlyLeaveMinutes
//             },

//             remarks,

//             isSuspicious: suspicious
//         });

//         await attendance.save({ session });

//         /* --------------------------------
//            9. Commit
//         -------------------------------- */

//         await session.commitTransaction();
//         session.endSession();

//         return res.status(201).json({
//             message: "Attendance marked successfully",
//             attendance
//         });

//     } catch (error) {

//         await session.abortTransaction();
//         session.endSession();

//         console.error("Attendance Error:", error);

//         return res.status(500).json({
//             message: "Failed to mark attendance",
//             error: error.message
//         });
//     }
// };




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

            if (distance <= employee.officeLocation.radius) {
                geoVerified = true;
            } else {
                suspicious = true;
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
            .select("_id empCode name phone email")
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

        const attendanceList = await Attendance.find({
            companyId,
            employeeId: { $in: employeeIds },
            date: today
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
                    name: emp.name,
                    phone: emp.phone,
                    email: emp.email,

                    date: today,

                    status: record?.status || "absent",

                    punchIn: record?.punchIn || null,
                    punchOut: record?.punchOut || null,

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



/**
 * Get Employee Monthly Attendance Summary
 * @route GET /api/reports/monthly-summary
 * @access Private (Company Admin/Manager)
 */
// controllers/attendanceReportController.js


/**
 * Get Employee Monthly Attendance Summary
 * @route GET /api/reports/monthly-summary
 * @access Private (Company Admin/Manager)
 */
export const getEmployeeSimpleMonthlySummary = async (req, res) => {
    try {
        /* ============================
           1. AUTHENTICATION & VALIDATION
        ============================ */

        const companyId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(companyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid company ID format"
            });
        }

        const companyObjectId = new mongoose.Types.ObjectId(companyId);

        /* ============================
           2. DATE RANGE HANDLING (Timezone Safe)
        ============================ */

        const { startDate, endDate } = req.query;

        // Default to current month
        const now = new Date();
        const start = startDate
            ? new Date(startDate)
            : new Date(now.getFullYear(), now.getMonth(), 1);

        const end = endDate
            ? new Date(endDate)
            : new Date(now);

        // Normalize dates for MongoDB query (UTC safe)
        start.setUTCHours(0, 0, 0, 0);
        end.setUTCHours(23, 59, 59, 999);

        /* ============================
           3. CHECK FOR ACTIVE EMPLOYEES
        ============================ */

        const activeEmployeesCount = await Employee.countDocuments({
            companyId: companyObjectId,
            employmentStatus: "active"
        });

        /* ============================
           4. AGGREGATION PIPELINE (FIXED)
        ============================ */

        const report = await Attendance.aggregate([
            // Stage 1: Match attendance records for the company within date range
            {
                $match: {
                    companyId: companyObjectId,
                    date: {
                        $gte: start,
                        $lte: end
                    }
                }
            },

            // Stage 2: Lookup employee with active status only
            {
                $lookup: {
                    from: "employees",
                    let: {
                        empId: "$employeeId",
                        compId: "$companyId"
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$userId", "$$empId"] },
                                        { $eq: ["$companyId", "$$compId"] },
                                        { $eq: ["$employmentStatus", "active"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "employee"
                }
            },

            // Stage 3: Keep only records with valid active employees
            {
                $unwind: {
                    path: "$employee",
                    preserveNullAndEmptyArrays: false
                }
            },

            // Stage 4: Lookup user details
            {
                $lookup: {
                    from: "users",
                    localField: "employeeId",
                    foreignField: "_id",
                    as: "user"
                }
            },

            // Stage 5: Unwind user
            {
                $unwind: {
                    path: "$user",
                    preserveNullAndEmptyArrays: false
                }
            },

            // Stage 6: Group by employee
            {
                $group: {
                    _id: "$employeeId",

                    // Employee Details
                    name: { $first: "$user.name" },
                    phone: { $first: "$user.phone" },
                    email: { $first: "$user.email" },
                    empCode: { $first: "$employee.empCode" },
                    department: { $first: "$employee.jobInfo.department" },
                    designation: { $first: "$employee.jobInfo.designation" },

                    // Working Days (Present/Half-day with approval)
                    workingDays: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $in: ["$status", ["present", "half_day"]] },
                                        { $eq: ["$approvalStatus", "approved"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // Present Days (Full day)
                    presentDays: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "present"] },
                                        { $eq: ["$approvalStatus", "approved"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // Half Days
                    halfDays: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "half_day"] },
                                        { $eq: ["$approvalStatus", "approved"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // Absent Days
                    absentDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "absent"] },
                                1,
                                0
                            ]
                        }
                    },

                    // Leave Days
                    leaveDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "leave"] },
                                1,
                                0
                            ]
                        }
                    },

                    // Holiday Days
                    holidayDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "holiday"] },
                                1,
                                0
                            ]
                        }
                    },

                    // Week Off Days
                    weekOffDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "week_off"] },
                                1,
                                0
                            ]
                        }
                    },

                    // Total Working Minutes
                    totalMinutes: {
                        $sum: {
                            $ifNull: ["$workSummary.totalMinutes", 0]
                        }
                    },

                    // Total Payable Minutes
                    payableMinutes: {
                        $sum: {
                            $ifNull: ["$workSummary.payableMinutes", 0]
                        }
                    },

                    // Overtime Minutes
                    overtimeMinutes: {
                        $sum: {
                            $ifNull: ["$workSummary.overtimeMinutes", 0]
                        }
                    },

                    // Late Minutes
                    lateMinutes: {
                        $sum: {
                            $ifNull: ["$workSummary.lateMinutes", 0]
                        }
                    },

                    // Early Leave Minutes
                    earlyLeaveMinutes: {
                        $sum: {
                            $ifNull: ["$workSummary.earlyLeaveMinutes", 0]
                        }
                    },

                    // Exception Days
                    exceptionDays: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $eq: ["$isSuspicious", true] },
                                        {
                                            $gt: [
                                                { $size: { $ifNull: ["$editLogs", []] } },
                                                0
                                            ]
                                        },
                                        { $eq: ["$approvalStatus", "pending"] },
                                        { $eq: ["$approvalStatus", "rejected"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // Suspicious Days
                    suspiciousDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$isSuspicious", true] },
                                1,
                                0
                            ]
                        }
                    },

                    // Edited Days
                    editedDays: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $size: { $ifNull: ["$editLogs", []] } },
                                        0
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // Pending Approval Days
                    pendingDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$approvalStatus", "pending"] },
                                1,
                                0
                            ]
                        }
                    },

                    // Rejected Days
                    rejectedDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$approvalStatus", "rejected"] },
                                1,
                                0
                            ]
                        }
                    },

                    // Late Days (days with late arrival)
                    lateDays: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $ifNull: ["$workSummary.lateMinutes", 0] },
                                        0
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // Early Leave Days
                    earlyLeaveDays: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $ifNull: ["$workSummary.earlyLeaveMinutes", 0] },
                                        0
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },

                    // Overtime Days
                    overtimeDays: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        { $ifNull: ["$workSummary.overtimeMinutes", 0] },
                                        0
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },

            // Stage 7: Calculate averages and additional metrics
            {
                $addFields: {
                    // Total Working Hours
                    totalWorkingHours: {
                        $round: [
                            { $divide: ["$totalMinutes", 60] },
                            2
                        ]
                    },

                    // Total Payable Hours
                    totalPayableHours: {
                        $round: [
                            { $divide: ["$payableMinutes", 60] },
                            2
                        ]
                    },

                    // Average Working Hours (per working day)
                    avgWorkingHours: {
                        $cond: [
                            { $gt: ["$workingDays", 0] },
                            {
                                $round: [
                                    {
                                        $divide: [
                                            "$totalMinutes",
                                            { $multiply: ["$workingDays", 60] }
                                        ]
                                    },
                                    2
                                ]
                            },
                            0
                        ]
                    },

                    // Average Payable Hours (per working day)
                    avgPayableHours: {
                        $cond: [
                            { $gt: ["$workingDays", 0] },
                            {
                                $round: [
                                    {
                                        $divide: [
                                            "$payableMinutes",
                                            { $multiply: ["$workingDays", 60] }
                                        ]
                                    },
                                    2
                                ]
                            },
                            0
                        ]
                    },

                    // Overtime Hours
                    overtimeHours: {
                        $round: [
                            { $divide: ["$overtimeMinutes", 60] },
                            2
                        ]
                    },

                    // Late Hours
                    lateHours: {
                        $round: [
                            { $divide: ["$lateMinutes", 60] },
                            2
                        ]
                    },

                    // Early Leave Hours
                    earlyLeaveHours: {
                        $round: [
                            { $divide: ["$earlyLeaveMinutes", 60] },
                            2
                        ]
                    },

                    // Attendance Rate (%)
                    attendanceRate: {
                        $cond: [
                            {
                                $gt: [
                                    { $add: ["$workingDays", "$absentDays", "$leaveDays"] },
                                    0
                                ]
                            },
                            {
                                $round: [
                                    {
                                        $multiply: [
                                            {
                                                $divide: [
                                                    "$workingDays",
                                                    {
                                                        $add: [
                                                            "$workingDays",
                                                            "$absentDays",
                                                            "$leaveDays"
                                                        ]
                                                    }
                                                ]
                                            },
                                            100
                                        ]
                                    },
                                    1
                                ]
                            },
                            0
                        ]
                    },

                    // Punctuality Rate (%)
                    punctualityRate: {
                        $cond: [
                            { $gt: ["$workingDays", 0] },
                            {
                                $round: [
                                    {
                                        $multiply: [
                                            {
                                                $divide: [
                                                    {
                                                        $subtract: [
                                                            "$workingDays",
                                                            { $add: ["$lateDays", "$earlyLeaveDays"] }
                                                        ]
                                                    },
                                                    "$workingDays"
                                                ]
                                            },
                                            100
                                        ]
                                    },
                                    1
                                ]
                            },
                            0
                        ]
                    },

                    // Performance Score (0-100)
                    performanceScore: {
                        $cond: [
                            { $gt: ["$workingDays", 0] },
                            {
                                $round: [
                                    {
                                        $max: [
                                            0,
                                            {
                                                $subtract: [
                                                    100,
                                                    {
                                                        $add: [
                                                            {
                                                                $multiply: [
                                                                    {
                                                                        $divide: [
                                                                            { $ifNull: ["$lateDays", 0] },
                                                                            "$workingDays"
                                                                        ]
                                                                    },
                                                                    15
                                                                ]
                                                            },
                                                            {
                                                                $multiply: [
                                                                    {
                                                                        $divide: [
                                                                            { $ifNull: ["$earlyLeaveDays", 0] },
                                                                            "$workingDays"
                                                                        ]
                                                                    },
                                                                    10
                                                                ]
                                                            },
                                                            {
                                                                $multiply: [
                                                                    {
                                                                        $divide: [
                                                                            { $ifNull: ["$exceptionDays", 0] },
                                                                            "$workingDays"
                                                                        ]
                                                                    },
                                                                    20
                                                                ]
                                                            },
                                                            {
                                                                $multiply: [
                                                                    {
                                                                        $divide: [
                                                                            { $ifNull: ["$absentDays", 0] },
                                                                            {
                                                                                $add: [
                                                                                    "$workingDays",
                                                                                    "$absentDays",
                                                                                    "$leaveDays"
                                                                                ]
                                                                            }
                                                                        ]
                                                                    },
                                                                    30
                                                                ]
                                                            }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    0
                                ]
                            },
                            0
                        ]
                    }
                }
            },

            // Stage 8: Format output (INCLUSION ONLY - NO EXCLUSION)
            {
                $project: {
                    // Employee Information (Include all fields we need)
                    userId: "$_id",
                    name: 1,
                    phone: 1,
                    email: 1,
                    empCode: 1,
                    department: 1,
                    designation: 1,

                    // Attendance Summary
                    workingDays: 1,
                    presentDays: 1,
                    halfDays: 1,
                    absentDays: 1,
                    leaveDays: 1,
                    holidayDays: 1,
                    weekOffDays: 1,

                    // Exception Summary
                    exceptionDays: 1,
                    suspiciousDays: 1,
                    editedDays: 1,
                    pendingDays: 1,
                    rejectedDays: 1,

                    // Time Metrics
                    totalWorkingHours: 1,
                    totalPayableHours: 1,
                    avgWorkingHours: 1,
                    avgPayableHours: 1,
                    overtimeHours: 1,
                    lateHours: 1,
                    earlyLeaveHours: 1,

                    // Day Counts
                    lateDays: 1,
                    earlyLeaveDays: 1,
                    overtimeDays: 1,

                    // Performance Metrics
                    attendanceRate: 1,
                    punctualityRate: 1,
                    performanceScore: 1,

                    // Raw minutes (optional - for calculations)
                    totalMinutes: 1,
                    payableMinutes: 1,
                    overtimeMinutes: 1,
                    lateMinutes: 1,
                    earlyLeaveMinutes: 1
                }
            },

            // Stage 9: Sorting
            {
                $sort: {
                    name: 1,
                    department: 1
                }
            }
        ]);

        /* ============================
           5. ENRICH WITH EMPLOYEES WITH NO ATTENDANCE
        ============================ */

        // Get employees with attendance records
        const employeesWithAttendance = report.map(r => r.userId.toString());

        // Get active employees without any attendance records
        const employeesWithoutAttendance = await Employee.aggregate([
            {
                $match: {
                    companyId: companyObjectId,
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
                $unwind: "$user"
            },
            {
                $match: {
                    "userId": {
                        $nin: employeesWithAttendance.map(id => new mongoose.Types.ObjectId(id))
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    userId: "$userId",
                    name: "$user.name",
                    phone: "$user.phone",
                    email: "$user.email",
                    empCode: 1,
                    department: "$jobInfo.department",
                    designation: "$jobInfo.designation",

                    // Zero values for employees with no attendance
                    workingDays: 0,
                    presentDays: 0,
                    halfDays: 0,
                    absentDays: 0,
                    leaveDays: 0,
                    holidayDays: 0,
                    weekOffDays: 0,

                    exceptionDays: 0,
                    suspiciousDays: 0,
                    editedDays: 0,
                    pendingDays: 0,
                    rejectedDays: 0,

                    totalWorkingHours: 0,
                    totalPayableHours: 0,
                    avgWorkingHours: 0,
                    avgPayableHours: 0,
                    overtimeHours: 0,
                    lateHours: 0,
                    earlyLeaveHours: 0,

                    lateDays: 0,
                    earlyLeaveDays: 0,
                    overtimeDays: 0,

                    attendanceRate: 0,
                    punctualityRate: 0,
                    performanceScore: 0,

                    totalMinutes: 0,
                    payableMinutes: 0,
                    overtimeMinutes: 0,
                    lateMinutes: 0,
                    earlyLeaveMinutes: 0
                }
            }
        ]);

        // Combine both arrays
        const completeReport = [...report, ...employeesWithoutAttendance];

        // Sort combined report by name
        completeReport.sort((a, b) => {
            if (!a.name) return 1;
            if (!b.name) return -1;
            return a.name.localeCompare(b.name);
        });

        /* ============================
           6. CALCULATE SUMMARY STATISTICS
        ============================ */

        // Calculate total days in period
        const totalDaysInPeriod = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

        const summary = {
            totalEmployees: completeReport.length,
            activeEmployees: activeEmployeesCount,
            employeesWithAttendance: report.length,
            employeesWithoutAttendance: employeesWithoutAttendance.length,
            totalDaysInPeriod,

            // Overall Statistics
            totalWorkingDays: completeReport.reduce((sum, emp) => sum + (emp.workingDays || 0), 0),
            totalPresentDays: completeReport.reduce((sum, emp) => sum + (emp.presentDays || 0), 0),
            totalHalfDays: completeReport.reduce((sum, emp) => sum + (emp.halfDays || 0), 0),
            totalAbsentDays: completeReport.reduce((sum, emp) => sum + (emp.absentDays || 0), 0),
            totalLeaveDays: completeReport.reduce((sum, emp) => sum + (emp.leaveDays || 0), 0),
            totalExceptionDays: completeReport.reduce((sum, emp) => sum + (emp.exceptionDays || 0), 0),

            // Time Statistics
            totalWorkingHours: completeReport.reduce((sum, emp) => sum + (emp.totalWorkingHours || 0), 0).toFixed(2),
            totalOvertimeHours: completeReport.reduce((sum, emp) => sum + (emp.overtimeHours || 0), 0).toFixed(2),

            // Average Statistics
            avgAttendanceRate: completeReport.length > 0
                ? (completeReport.reduce((sum, emp) => sum + (emp.attendanceRate || 0), 0) / completeReport.length).toFixed(1)
                : 0,
            avgWorkingHoursPerEmployee: completeReport.length > 0
                ? (completeReport.reduce((sum, emp) => sum + (emp.totalWorkingHours || 0), 0) / completeReport.length).toFixed(2)
                : 0,
            avgPerformanceScore: completeReport.length > 0
                ? (completeReport.reduce((sum, emp) => sum + (emp.performanceScore || 0), 0) / completeReport.length).toFixed(0)
                : 0
        };

        /* ============================
           7. GET DEPARTMENT BREAKDOWN
        ============================ */

        const departmentBreakdown = await getDepartmentBreakdown(companyObjectId, start, end);
        summary.departmentBreakdown = departmentBreakdown;

        /* ============================
           8. RESPONSE
        ============================ */

        res.status(200).json({
            success: true,
            message: completeReport.length > 0
                ? "Monthly attendance report generated successfully"
                : "No attendance records found for the specified period",
            data: {
                period: {
                    start: start.toISOString(),
                    end: end.toISOString(),
                    days: totalDaysInPeriod,
                    month: start.toLocaleString('default', { month: 'long' }),
                    year: start.getFullYear()
                },
                summary,
                report: completeReport
            }
        });

    } catch (error) {
        console.error("Monthly Report Error:", {
            message: error.message,
            stack: error.stack,
            query: req.query,
            user: req.user?._id
        });

        res.status(500).json({
            success: false,
            message: "Failed to generate monthly attendance report",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Get Department Breakdown Statistics
 * @private Helper Function
 */
async function getDepartmentBreakdown(companyId, startDate, endDate) {
    try {
        const departmentStats = await Attendance.aggregate([
            {
                $match: {
                    companyId: companyId,
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "employeeId",
                    foreignField: "userId",
                    as: "employee"
                }
            },
            {
                $unwind: "$employee"
            },
            {
                $match: {
                    "employee.employmentStatus": "active",
                    "employee.companyId": companyId
                }
            },
            {
                $group: {
                    _id: "$employee.jobInfo.department",
                    employeeCount: { $addToSet: "$employeeId" },
                    totalWorkingDays: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $in: ["$status", ["present", "half_day"]] },
                                        { $eq: ["$approvalStatus", "approved"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    totalPresentDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "present"] },
                                1,
                                0
                            ]
                        }
                    },
                    totalHalfDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "half_day"] },
                                1,
                                0
                            ]
                        }
                    },
                    totalAbsentDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "absent"] },
                                1,
                                0
                            ]
                        }
                    },
                    totalLeaveDays: {
                        $sum: {
                            $cond: [
                                { $eq: ["$status", "leave"] },
                                1,
                                0
                            ]
                        }
                    },
                    totalMinutes: {
                        $sum: {
                            $ifNull: ["$workSummary.totalMinutes", 0]
                        }
                    },
                    totalOvertimeMinutes: {
                        $sum: {
                            $ifNull: ["$workSummary.overtimeMinutes", 0]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    department: { $ifNull: ["$_id", "Unassigned"] },
                    employeeCount: { $size: "$employeeCount" },
                    totalWorkingDays: 1,
                    totalPresentDays: 1,
                    totalHalfDays: 1,
                    totalAbsentDays: 1,
                    totalLeaveDays: 1,
                    totalWorkingHours: {
                        $round: [
                            { $divide: ["$totalMinutes", 60] },
                            1
                        ]
                    },
                    totalOvertimeHours: {
                        $round: [
                            { $divide: ["$totalOvertimeMinutes", 60] },
                            1
                        ]
                    },
                    attendanceRate: {
                        $cond: [
                            {
                                $gt: [
                                    { $add: ["$totalWorkingDays", "$totalAbsentDays", "$totalLeaveDays"] },
                                    0
                                ]
                            },
                            {
                                $round: [
                                    {
                                        $multiply: [
                                            {
                                                $divide: [
                                                    "$totalWorkingDays",
                                                    {
                                                        $add: [
                                                            "$totalWorkingDays",
                                                            "$totalAbsentDays",
                                                            "$totalLeaveDays"
                                                        ]
                                                    }
                                                ]
                                            },
                                            100
                                        ]
                                    },
                                    1
                                ]
                            },
                            0
                        ]
                    }
                }
            },
            {
                $sort: { department: 1 }
            }
        ]);

        return departmentStats;
    } catch (error) {
        console.error("Department breakdown error:", error);
        return [];
    }
}

/**
 * Export Report as CSV
 * @route GET /api/reports/monthly-summary/export
 * @access Private
 */
export const exportMonthlyReportCSV = async (req, res) => {
    try {
        // Get the report data first
        const reportResponse = await getEmployeeSimpleMonthlySummary(req, res, true);

        if (!reportResponse || !reportResponse.data) {
            throw new Error("Failed to generate report data");
        }

        const { report, period } = reportResponse.data;

        // Generate CSV headers
        let csv = 'Employee Code,Employee Name,Department,Designation,';
        csv += 'Working Days,Present Days,Half Days,Absent Days,Leave Days,';
        csv += 'Exception Days,Total Hours,Avg Hours,Overtime Hours,';
        csv += 'Attendance Rate(%),Performance Score\n';

        // Add data rows
        report.forEach(emp => {
            csv += `${emp.empCode || 'N/A'},`;
            csv += `"${emp.name || 'N/A'}",`;
            csv += `${emp.department || 'N/A'},`;
            csv += `${emp.designation || 'N/A'},`;
            csv += `${emp.workingDays || 0},`;
            csv += `${emp.presentDays || 0},`;
            csv += `${emp.halfDays || 0},`;
            csv += `${emp.absentDays || 0},`;
            csv += `${emp.leaveDays || 0},`;
            csv += `${emp.exceptionDays || 0},`;
            csv += `${emp.totalWorkingHours || 0},`;
            csv += `${emp.avgWorkingHours || 0},`;
            csv += `${emp.overtimeHours || 0},`;
            csv += `${emp.attendanceRate || 0},`;
            csv += `${emp.performanceScore || 0}\n`;
        });

        // Set response headers
        const filename = `attendance-report-${period.month}-${period.year}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.status(200).send(csv);

    } catch (error) {
        console.error("CSV Export Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to export report as CSV",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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
const formatTime = (date) => {
    if (!date) return "-";

    try {
        return new Date(date).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",   // Force IST
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    } catch (err) {
        console.error("formatTime error:", err);
        return "-";
    }
};


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


/* =================================================
   GET: Employee Attendance Summary + CSV
================================================= */

export const getEmployeeAttendanceSummary = async (req, res) => {

    try {

        /* ============================
           1. Auth
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
        const format = req.query.format; // csv | json

        if (!month || !year || month < 1 || month > 12 || year < 2000) {
            return res.status(400).json({
                success: false,
                message: "Invalid month/year"
            });
        }


        /* ============================
           3. Block Future Months
        ============================ */

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (
            year > today.getFullYear() ||
            (year === today.getFullYear() && month > today.getMonth() + 1)
        ) {
            return res.status(400).json({
                success: false,
                message: "Future month not allowed"
            });
        }


        /* ============================
           4. Employee
        ============================ */

        const employee = await Employee.findOne({
            userId,
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


        /* ============================
           5. Date Range
        ============================ */

        const { start, end } = buildMonthRange(year, month);


        /* ============================
           6. Attendance
        ============================ */

        const records = await Attendance.find({
            employeeId: employee._id,
            date: { $gte: start, $lte: end }
        })
            .sort({ date: -1 })
            .lean();


        /* ============================
           7. Build Lookup Map
        ============================ */

        const map = new Map();

        records.forEach(r => {
            const key = r.date.toISOString().split("T")[0];
            map.set(key, r);
        });


        /* ============================
           8. Calculate Loop Range
        ============================ */

        const isCurrentMonth =
            today.getFullYear() === year &&
            today.getMonth() + 1 === month;

        const lastDay = isCurrentMonth
            ? today.getDate() // till today
            : new Date(year, month, 0).getDate(); // full month


        const todayKey = today.toISOString().split("T")[0];
        const yesterdayKey = new Date(today.getTime() - 86400000)
            .toISOString()
            .split("T")[0];


        /* ============================
           9. Build Report
        ============================ */

        let presentDays = 0;
        let absentDays = 0;
        let totalMinutes = 0;

        const report = [];


        for (let i = lastDay; i >= 1; i--) {

            const date = new Date(year, month - 1, i);
            date.setHours(0, 0, 0, 0);

            const key = date.toISOString().split("T")[0];

            let label = date.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short"
            });

            if (key === todayKey) label = "Today";
            if (key === yesterdayKey) label = "Yesterday";

            const rec = map.get(key);


            /* ---------- No Record ---------- */
            if (!rec) {

                // Today without punch → Pending
                if (key === todayKey) {

                    report.push({
                        Date: "Today",
                        TimeIn: "Pending",
                        TimeOut: "-",
                        TotalHours: "-"
                    });

                    continue;
                }

                // Past day → Absent
                absentDays++;

                report.push({
                    Date: label,
                    TimeIn: "Absent",
                    TimeOut: "-",
                    TotalHours: "-"
                });

                continue;
            }


            /* ---------- Holiday / Week Off ---------- */

            if (
                rec.status === "holiday" ||
                rec.status === "week_off"
            ) {

                report.push({
                    Date: label,
                    TimeIn: rec.status === "holiday" ? "Holiday" : "Week Off",
                    TimeOut: "-",
                    TotalHours: "-"
                });

                continue;
            }


            /* ---------- Present ---------- */

            if (rec.status === "present") presentDays++;

            const minutes = rec.workSummary?.totalMinutes || 0;

            totalMinutes += minutes;

            report.push({
                Date: label,
                TimeIn: formatTime(rec.punchIn),
                TimeOut: rec.punchOut
                    ? formatTime(rec.punchOut)
                    : "-",
                TotalHours: formatMinutes(minutes)
            });
        }


        /* ============================
           10. CSV Export
        ============================ */

        if (format === "csv") {

            const parser = new Parser({
                fields: ["Date", "TimeIn", "TimeOut", "TotalHours"]
            });

            const csv = parser.parse(report);

            const fileName =
                `attendance_${employee.empCode}_${month}_${year}.csv`;


            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${fileName}"`
            );

            return res.status(200).send(csv);
        }


        /* ============================
           11. Summary
        ============================ */

        const avgMinutes = presentDays
            ? Math.round(totalMinutes / presentDays)
            : 0;


        /* ============================
           12. JSON Response
        ============================ */

        return res.status(200).json({

            success: true,

            meta: {
                employeeId: employee._id,
                empCode: employee.empCode,
                month,
                year
            },

            summary: {
                avgPerDay: formatMinutes(avgMinutes),
                presentDays,
                absentDays,
                totalShownDays: lastDay
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

        /* ================================
           Force IST Timezone
        ================================= */

        moment.tz.setDefault("Asia/Kolkata");

        const {
            startDate,
            endDate,
            month,   // YYYY-MM
            year
        } = req.query;

        let fromDateIST;
        let toDateIST;

        /* ================================
           Date Filter (IST)
        ================================= */

        // Monthly
        if (month) {

            fromDateIST = moment
                .tz(month, "YYYY-MM", "Asia/Kolkata")
                .startOf("month");

            toDateIST = moment
                .tz(month, "YYYY-MM", "Asia/Kolkata")
                .endOf("month");
        }

        // Custom Range
        else if (startDate && endDate) {

            fromDateIST = moment
                .tz(startDate, "YYYY-MM-DD", "Asia/Kolkata")
                .startOf("day");

            toDateIST = moment
                .tz(endDate, "YYYY-MM-DD", "Asia/Kolkata")
                .endOf("day");
        }

        // Yearly
        else if (year) {

            fromDateIST = moment
                .tz(`${year}-01-01`, "Asia/Kolkata")
                .startOf("year");

            toDateIST = moment
                .tz(`${year}-12-31`, "Asia/Kolkata")
                .endOf("year");
        }

        else {
            return res.status(400).json({
                success: false,
                message: "Provide month OR startDate+endDate OR year"
            });
        }

        /* ================================
           Convert IST → UTC (DB Query)
        ================================= */

        const fromUTC = fromDateIST.clone().utc().toDate();
        const toUTC = toDateIST.clone().utc().toDate();

        /* ================================
           Fetch Attendance
        ================================= */

        const records = await Attendance.find({
            companyId,
            date: {
                $gte: fromUTC,
                $lte: toUTC
            }
        })
            .populate("employeeId", "name email phone")
            .lean();

        if (!records.length) {
            return res.status(404).json({
                success: false,
                message: "No attendance data found"
            });
        }

        /* ================================
           Format CSV (IST Display)
        ================================= */

        const formattedData = records.map(row => {

            /* Break Calculation (IST Safe) */
            const totalBreakMinutes = row.breaks?.reduce((acc, b) => {

                if (b.start && b.end) {

                    const start = moment(b.start).tz("Asia/Kolkata");
                    const end = moment(b.end).tz("Asia/Kolkata");

                    return acc + end.diff(start, "minutes");
                }

                return acc;

            }, 0) || 0;

            return {

                /* Employee */
                CompanyID: row.companyId,

                EmployeeName: row.employeeId?.name || "N/A",
                EmployeeEmail: row.employeeId?.email || "N/A",
                EmployeePhone: row.employeeId?.phone || "N/A",

                /* Date (IST) */
                Date: moment(row.date)
                    .tz("Asia/Kolkata")
                    .format("DD-MMM-YYYY"),

                Day: moment(row.date)
                    .tz("Asia/Kolkata")
                    .format("dddd"),

                Month: moment(row.date)
                    .tz("Asia/Kolkata")
                    .format("MMMM"),

                Year: moment(row.date)
                    .tz("Asia/Kolkata")
                    .format("YYYY"),

                /* Shift */
                ShiftName: row.shift?.name || "General",
                ShiftStart: row.shift?.startTime || "",
                ShiftEnd: row.shift?.endTime || "",

                /* Punch (IST) */
                PunchIn: row.punchIn
                    ? moment(row.punchIn)
                        .tz("Asia/Kolkata")
                        .format("hh:mm A")
                    : "",

                PunchOut: row.punchOut
                    ? moment(row.punchOut)
                        .tz("Asia/Kolkata")
                        .format("hh:mm A")
                    : "",

                /* Work */
                TotalWorkMinutes: row.workSummary?.totalMinutes || 0,
                OvertimeMinutes: row.workSummary?.overtimeMinutes || 0,
                LateMinutes: row.workSummary?.lateMinutes || 0,
                EarlyLeaveMinutes: row.workSummary?.earlyLeaveMinutes || 0,

                BreakMinutes: totalBreakMinutes,

                /* Status */
                Status: row.status,

                /* Location */
                Latitude: row.geoLocation?.coordinates?.[1] || "",
                Longitude: row.geoLocation?.coordinates?.[0] || "",
                LocationAccuracy: row.geoLocation?.accuracy || "",
                LocationVerified: row.geoLocation?.verified ? "Yes" : "No",

                /* Device */
                DeviceID: row.deviceInfo?.deviceId || "",
                Platform: row.deviceInfo?.platform || "",
                AppVersion: row.deviceInfo?.appVersion || "",
                IP: row.deviceInfo?.ip || "",

                /* Audit */
                Remarks: row.remarks || "",
                AutoMarked: row.isAutoMarked ? "Yes" : "No",
                Suspicious: row.isSuspicious ? "Yes" : "No",

                CreatedAt: moment(row.createdAt)
                    .tz("Asia/Kolkata")
                    .format("DD-MMM-YYYY HH:mm"),

                UpdatedAt: moment(row.updatedAt)
                    .tz("Asia/Kolkata")
                    .format("DD-MMM-YYYY HH:mm")
            };
        });

        /* ================================
           Convert to CSV
        ================================= */

        const parser = new Parser();
        const csv = parser.parse(formattedData);

        /* ================================
           Download
        ================================= */

        const fileName =
            `attendance_${fromDateIST.format("YYYYMMDD")}_${toDateIST.format("YYYYMMDD")}.csv`;

        res.header("Content-Type", "text/csv");
        res.header("Content-Disposition", `attachment; filename=${fileName}`);

        return res.status(200).send(csv);

    } catch (error) {

        console.error("CSV Export Error:", error);

        return res.status(500).json({
            success: false,
            message: "CSV Export Failed",
            error: error.message
        });
    }
};

