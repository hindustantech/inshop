import Employee from "../../models/Attandance/Employee.js";
// import Employee from "../../models/Attandance/Employee.js";
import Attendance from "../../models/Attandance/Attendance.js";
import Holiday from "../../models/Attandance/Holiday.js";
import Payroll from "../../models/Attandance/Payroll.js";
import mongoose from "mongoose";
import { normalizeToUTCDate, buildDateRange } from "./utils/date.utils.js";
import { Parser } from "json2csv";
import moment from "moment";
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

export const markAttendance = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        /* --------------------------------
           1. Extract Auth + Body
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
                message: "Attendance token is required"
            });

        }


        if (!date || !punchIn || !geoLocation?.coordinates) {
            return res.status(400).json({
                message: "date, punchIn, and geoLocation required"
            });
        }

        // 2) Verify token

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }

        // 3) Fetch user from DB
        const user = await User.findById(decoded.userId).select('-password -otp -__v');
        if (!user) {
            return res.status(401).json({ message: 'User not found, authorization denied' });
        }

        const companyId = user?._id; // from JWT



        const attendanceDate = normalizeDate(date);

        /* --------------------------------
           2. Validate Employee
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
                message: "Unauthorized company access"
            });
        }


        /* --------------------------------
           3. Prevent Duplicate Entry
        -------------------------------- */

        const existing = await Attendance.findOne({
            companyId,
            employeeId: employee._id,
            date: attendanceDate
        }).session(session);

        if (existing) {
            return res.status(409).json({
                message: "Attendance already marked"
            });
        }

        /* --------------------------------
           4. Check Holiday
        -------------------------------- */

        const holiday = await Holiday.findOne({
            companyId,
            date: attendanceDate
        }).session(session);

        let status = "present";

        if (holiday) {
            status = "holiday";
        }

        /* --------------------------------
           5. Geo-Fencing Validation
        -------------------------------- */

        let geoVerified = false;
        let suspicious = false;

        if (employee.officeLocation?.coordinates?.length === 2) {
            const [officeLng, officeLat] = employee.officeLocation.coordinates;
            const [userLng, userLat] = geoLocation.coordinates;

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
           6. Work Calculation
        -------------------------------- */

        let totalMinutes = 0;
        let overtimeMinutes = 0;
        let lateMinutes = 0;
        let earlyLeaveMinutes = 0;

        const inTime = new Date(punchIn);
        const outTime = punchOut ? new Date(punchOut) : null;

        if (outTime) {
            totalMinutes = diffMinutes(inTime, outTime);
        }

        /* ------ Break Deduction ------ */

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

        /* ------ Shift Logic ------ */

        if (shift?.startTime && shift?.endTime) {
            const shiftStart = new Date(
                `${attendanceDate.toISOString().split("T")[0]}T${shift.startTime}:00`
            );

            const shiftEnd = new Date(
                `${attendanceDate.toISOString().split("T")[0]}T${shift.endTime}:00`
            );

            // Late
            if (inTime > shiftStart) {
                lateMinutes = diffMinutes(shiftStart, inTime);
            }

            // Early leave
            if (outTime && outTime < shiftEnd) {
                earlyLeaveMinutes = diffMinutes(outTime, shiftEnd);
            }

            // Overtime
            if (outTime && outTime > shiftEnd) {
                overtimeMinutes = diffMinutes(shiftEnd, outTime);
            }
        }

        /* --------------------------------
           7. Half Day Logic
        -------------------------------- */

        if (totalMinutes < 240 && status === "present") {
            status = "half_day";
        }

        if (!outTime && status === "present") {
            suspicious = true;
        }

        /* --------------------------------
           8. Save Attendance
        -------------------------------- */

        const attendance = new Attendance({
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

            isSuspicious: suspicious
        });

        await attendance.save({ session });

        /* --------------------------------
           9. Commit
        -------------------------------- */

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            message: "Attendance marked successfully",
            attendance
        });

    } catch (error) {

        await session.abortTransaction();
        session.endSession();

        console.error("Attendance Error:", error);

        return res.status(500).json({
            message: "Failed to mark attendance",
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



//  * Export Attendance to CSV
//  * Supports:
//  *  - Monthly
//  *  - Custom Date Range
//  */
export const exportAttendanceCSV = async (req, res) => {
    try {
        const companyId = req.user._id;

        const {
            startDate,
            endDate,
            month,   // format: YYYY-MM (optional)
            year     // optional
        } = req.query;

        let fromDate;
        let toDate;

        /* ================================
           Date Filter Logic
        ================================= */

        // Case 1: Monthly Export
        if (month) {
            fromDate = moment(month, "YYYY-MM").startOf("month").toDate();
            toDate = moment(month, "YYYY-MM").endOf("month").toDate();
        }

        // Case 2: Custom Date Range
        else if (startDate && endDate) {
            fromDate = new Date(startDate);
            toDate = new Date(endDate);
        }

        // Case 3: Yearly
        else if (year) {
            fromDate = moment(`${year}-01-01`).startOf("year").toDate();
            toDate = moment(`${year}-12-31`).endOf("year").toDate();
        }

        else {
            return res.status(400).json({
                success: false,
                message: "Provide month OR startDate+endDate OR year"
            });
        }

        /* ================================
           Fetch Attendance
        ================================= */

        const records = await Attendance.find({
            companyId,
            date: {
                $gte: fromDate,
                $lte: toDate
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
           Format for CSV (Readable)
        ================================= */

        const formattedData = records.map((row) => {

            const totalBreakMinutes = row.breaks?.reduce((acc, b) => {
                if (b.start && b.end) {
                    return acc + moment(b.end).diff(moment(b.start), "minutes");
                }
                return acc;
            }, 0);

            return {

                // Company & Employee
                CompanyID: row.companyId,
                EmployeeName: row.employeeId?.name || "N/A",
                EmployeeEmail: row.employeeId?.email || "N/A",
                EmployeePhone: row.employeeId?.phone || "N/A",

                // Date Info
                Date: moment(row.date).format("DD-MMM-YYYY"),
                Day: moment(row.date).format("dddd"),
                Month: moment(row.date).format("MMMM"),
                Year: moment(row.date).format("YYYY"),

                // Shift
                ShiftName: row.shift?.name || "General",
                ShiftStart: row.shift?.startTime || "",
                ShiftEnd: row.shift?.endTime || "",

                // Punch
                PunchIn: row.punchIn
                    ? moment(row.punchIn).format("hh:mm A")
                    : "",

                PunchOut: row.punchOut
                    ? moment(row.punchOut).format("hh:mm A")
                    : "",

                // Work Summary
                TotalWorkMinutes: row.workSummary?.totalMinutes || 0,
                OvertimeMinutes: row.workSummary?.overtimeMinutes || 0,
                LateMinutes: row.workSummary?.lateMinutes || 0,
                EarlyLeaveMinutes: row.workSummary?.earlyLeaveMinutes || 0,

                BreakMinutes: totalBreakMinutes,

                // Status
                Status: row.status,

                // Location
                Latitude: row.geoLocation?.coordinates?.[1] || "",
                Longitude: row.geoLocation?.coordinates?.[0] || "",
                LocationAccuracy: row.geoLocation?.accuracy || "",
                LocationVerified: row.geoLocation?.verified ? "Yes" : "No",

                // Device
                DeviceID: row.deviceInfo?.deviceId || "",
                Platform: row.deviceInfo?.platform || "",
                AppVersion: row.deviceInfo?.appVersion || "",
                IP: row.deviceInfo?.ip || "",

                // Audit
                Remarks: row.remarks || "",
                AutoMarked: row.isAutoMarked ? "Yes" : "No",
                Suspicious: row.isSuspicious ? "Yes" : "No",

                CreatedAt: moment(row.createdAt).format("DD-MMM-YYYY HH:mm"),
                UpdatedAt: moment(row.updatedAt).format("DD-MMM-YYYY HH:mm")
            };
        });

        /* ================================
           Convert to CSV
        ================================= */

        const parser = new Parser();
        const csv = parser.parse(formattedData);

        /* ================================
           Download Settings
        ================================= */

        const fileName = `attendance_${moment(fromDate).format("YYYYMMDD")}_${moment(toDate).format("YYYYMMDD")}.csv`;

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
