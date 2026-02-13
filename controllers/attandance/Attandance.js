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




export const getEmployeeMonthlyCards = async (req, res) => {
    try {
        const { companyId, startDate, endDate, department, role, status } = req.query;

        // Build filter for employees
        const employeeFilter = { companyId: new mongoose.Types.ObjectId(companyId) };

        if (department) {
            employeeFilter['jobInfo.department'] = department;
        }

        if (role) {
            employeeFilter.role = role;
        }

        if (status) {
            employeeFilter.employmentStatus = status;
        }

        // Set date range (default: current month)
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        // Aggregate pipeline
        const employeeSummary = await Employee.aggregate([
            // Match employees for the company
            {
                $match: employeeFilter
            },

            // Lookup user details
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },

            // Unwind user details
            {
                $unwind: {
                    path: "$userDetails",
                    preserveNullAndEmptyArrays: false
                }
            },

            // Lookup attendance records for date range
            {
                $lookup: {
                    from: "attendances",
                    let: { employeeId: "$userId", companyId: "$companyId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$employeeId", "$$employeeId"] },
                                        { $eq: ["$companyId", "$$companyId"] },
                                        { $gte: ["$date", start] },
                                        { $lte: ["$date", end] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "attendanceRecords"
                }
            },

            // Calculate attendance summary
            {
                $addFields: {
                    // Total present days (approved attendance)
                    totalPresentDays: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: {
                                    $and: [
                                        { $eq: ["$$record.status", "present"] },
                                        { $eq: ["$$record.approvalStatus", "approved"] }
                                    ]
                                }
                            }
                        }
                    },

                    // Total absent days
                    totalAbsentDays: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $eq: ["$$record.status", "absent"] }
                            }
                        }
                    },

                    // Total half days
                    totalHalfDays: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $eq: ["$$record.status", "half_day"] }
                            }
                        }
                    },

                    // Total leaves
                    totalLeaves: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $eq: ["$$record.status", "leave"] }
                            }
                        }
                    },

                    // Total holidays
                    totalHolidays: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $eq: ["$$record.status", "holiday"] }
                            }
                        }
                    },

                    // Total week offs
                    totalWeekOffs: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $eq: ["$$record.status", "week_off"] }
                            }
                        }
                    },

                    // Pending approvals
                    pendingApprovals: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $eq: ["$$record.approvalStatus", "pending"] }
                            }
                        }
                    },

                    // Total working minutes (from workSummary)
                    totalWorkingMinutes: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$attendanceRecords",
                                        as: "record",
                                        cond: {
                                            $in: ["$$record.status", ["present", "half_day"]]
                                        }
                                    }
                                },
                                as: "record",
                                in: "$$record.workSummary.totalMinutes"
                            }
                        }
                    },

                    // Total overtime minutes
                    totalOvertimeMinutes: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$attendanceRecords",
                                        as: "record",
                                        cond: {
                                            $in: ["$$record.status", ["present", "half_day"]]
                                        }
                                    }
                                },
                                as: "record",
                                in: "$$record.workSummary.overtimeMinutes"
                            }
                        }
                    },

                    // Total late minutes
                    totalLateMinutes: {
                        $sum: {
                            $map: {
                                input: "$attendanceRecords",
                                as: "record",
                                in: "$$record.workSummary.lateMinutes"
                            }
                        }
                    },

                    // Total early leave minutes
                    totalEarlyLeaveMinutes: {
                        $sum: {
                            $map: {
                                input: "$attendanceRecords",
                                as: "record",
                                in: "$$record.workSummary.earlyLeaveMinutes"
                            }
                        }
                    },

                    // Days with suspicious activity
                    suspiciousDays: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $eq: ["$$record.isSuspicious", true] }
                            }
                        }
                    },

                    // Days with manual edits
                    editedDays: {
                        $size: {
                            $filter: {
                                input: "$attendanceRecords",
                                as: "record",
                                cond: { $gt: [{ $size: "$$record.editLogs" }, 0] }
                            }
                        }
                    }
                }
            },

            // Calculate averages and formatted hours
            {
                $addFields: {
                    // Total working days in period
                    totalDaysInPeriod: {
                        $size: "$attendanceRecords"
                    },

                    // Average working hours per present day
                    avgWorkingHours: {
                        $cond: {
                            if: { $gt: ["$totalPresentDays", 0] },
                            then: {
                                $round: [
                                    { $divide: ["$totalWorkingMinutes", 60] },
                                    2
                                ]
                            },
                            else: 0
                        }
                    },

                    // Average working hours per day (including all days)
                    avgDailyWorkingHours: {
                        $cond: {
                            if: { $gt: [{ $size: "$attendanceRecords" }, 0] },
                            then: {
                                $round: [
                                    {
                                        $divide: [
                                            "$totalWorkingMinutes",
                                            { $multiply: [{ $size: "$attendanceRecords" }, 60] }
                                        ]
                                    },
                                    2
                                ]
                            },
                            else: 0
                        }
                    },

                    // Format working hours as HH:MM
                    formattedTotalHours: {
                        $concat: [
                            { $toString: { $floor: { $divide: ["$totalWorkingMinutes", 60] } } },
                            "h ",
                            { $toString: { $mod: ["$totalWorkingMinutes", 60] } },
                            "m"
                        ]
                    },

                    // Format overtime hours as HH:MM
                    formattedOvertimeHours: {
                        $concat: [
                            { $toString: { $floor: { $divide: ["$totalOvertimeMinutes", 60] } } },
                            "h ",
                            { $toString: { $mod: ["$totalOvertimeMinutes", 60] } },
                            "m"
                        ]
                    },

                    // Format late hours as HH:MM
                    formattedLateHours: {
                        $concat: [
                            { $toString: { $floor: { $divide: ["$totalLateMinutes", 60] } } },
                            "h ",
                            { $toString: { $mod: ["$totalLateMinutes", 60] } },
                            "m"
                        ]
                    },

                    // Attendance percentage
                    attendancePercentage: {
                        $cond: {
                            if: { $gt: [{ $size: "$attendanceRecords" }, 0] },
                            then: {
                                $round: [
                                    {
                                        $multiply: [
                                            { $divide: ["$totalPresentDays", { $size: "$attendanceRecords" }] },
                                            100
                                        ]
                                    },
                                    1
                                ]
                            },
                            else: 0
                        }
                    }
                }
            },

            // Project final output
            {
                $project: {
                    _id: 1,
                    empCode: 1,
                    role: 1,
                    employmentStatus: 1,
                    jobInfo: 1,

                    // User details
                    employeeName: "$userDetails.name",
                    phone: "$userDetails.phone",
                    email: "$userDetails.email",
                    profileImage: "$userDetails.profileImage",
                    uid: "$userDetails.uid",

                    // Summary counts
                    totalDaysInPeriod: 1,
                    totalPresentDays: 1,
                    totalAbsentDays: 1,
                    totalHalfDays: 1,
                    totalLeaves: 1,
                    totalHolidays: 1,
                    totalWeekOffs: 1,
                    pendingApprovals: 1,
                    suspiciousDays: 1,
                    editedDays: 1,

                    // Time calculations
                    totalWorkingMinutes: 1,
                    totalOvertimeMinutes: 1,
                    totalLateMinutes: 1,
                    totalEarlyLeaveMinutes: 1,

                    // Formatted hours
                    formattedTotalHours: 1,
                    formattedOvertimeHours: 1,
                    formattedLateHours: 1,

                    // Averages
                    avgWorkingHours: 1,
                    avgDailyWorkingHours: 1,
                    attendancePercentage: 1,

                    // Latest attendance record
                    latestAttendance: {
                        $arrayElemAt: [
                            {
                                $sortArray: {
                                    input: "$attendanceRecords",
                                    sortBy: { date: -1 }
                                }
                            },
                            0
                        ]
                    }
                }
            },

            // Sort by employee name
            {
                $sort: { employeeName: 1 }
            }
        ]);

        // Get overall statistics
        const overallStats = await Attendance.aggregate([
            {
                $match: {
                    companyId: new mongoose.Types.ObjectId(companyId),
                    date: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAttendanceRecords: { $sum: 1 },
                    totalPresentAcrossCompany: {
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
                    totalAbsentAcrossCompany: {
                        $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
                    },
                    totalHalfDaysAcrossCompany: {
                        $sum: { $cond: [{ $eq: ["$status", "half_day"] }, 1, 0] }
                    },
                    totalLeavesAcrossCompany: {
                        $sum: { $cond: [{ $eq: ["$status", "leave"] }, 1, 0] }
                    },
                    totalWorkingMinutesAcrossCompany: {
                        $sum: "$workSummary.totalMinutes"
                    },
                    totalOvertimeMinutesAcrossCompany: {
                        $sum: "$workSummary.overtimeMinutes"
                    },
                    avgWorkingHoursAcrossCompany: {
                        $avg: {
                            $cond: [
                                { $gt: ["$workSummary.totalMinutes", 0] },
                                { $divide: ["$workSummary.totalMinutes", 60] },
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                employees: employeeSummary,
                summary: {
                    dateRange: { start, end },
                    totalEmployees: employeeSummary.length,
                    overallStats: overallStats[0] || {},
                    filters: { department, role, status }
                }
            }
        });

    } catch (error) {
        console.error("Error fetching employee summary:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch employee summary",
            error: error.message
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

