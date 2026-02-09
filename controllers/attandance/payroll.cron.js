import cron from "node-cron";
import mongoose from "mongoose";
import Attendance from "../../models/Attandance/Attendance.js";
import Employee from "../../models/Attandance/Employee.js";
import Holiday from "../../models/Attandance/Holiday.js";
import Payroll from "../../models/Attandance/Payroll.js";

/* ===========================================
   Date Helpers
=========================================== */

function getLastMonthRange() {

    const now = new Date();

    const start = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
        0, 0, 0
    );

    const end = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23, 59, 59
    );

    const monthKey = `${start.getFullYear()}-${String(
        start.getMonth() + 1
    ).padStart(2, "0")}`;

    return { start, end, monthKey };
}

/* ===========================================
   Payroll Engine
=========================================== */

async function runPayroll() {

    console.log("🔁 Payroll Cron Started");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

        const { start, end, monthKey } = getLastMonthRange();

        /* ---------------------------------------
           1. Fetch Active Employees
        --------------------------------------- */

        const employees = await Employee.find({
            employmentStatus: "active"
        }).session(session);

        console.log(`Employees: ${employees.length}`);

        /* ---------------------------------------
           2. Process Each Employee
        --------------------------------------- */

        for (const emp of employees) {

            /* --- Prevent Duplicate Payroll --- */

            const exists = await Payroll.findOne({
                companyId: emp.companyId,
                employeeId: emp._id,
                month: monthKey
            }).session(session);

            if (exists) continue;

            /* --------------------------------
               3. Aggregate Attendance
            -------------------------------- */

            const stats = await Attendance.aggregate([
                {
                    $match: {
                        companyId: emp.companyId,
                        employeeId: emp._id,
                        date: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: null,

                        present: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "present"] }, 1, 0]
                            }
                        },

                        halfDay: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "half_day"] }, 1, 0]
                            }
                        },

                        leave: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "leave"] }, 1, 0]
                            }
                        },

                        holiday: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "holiday"] }, 1, 0]
                            }
                        },

                        absent: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "absent"] }, 1, 0]
                            }
                        },

                        totalMinutes: {
                            $sum: "$workSummary.totalMinutes"
                        },

                        overtimeMinutes: {
                            $sum: "$workSummary.overtimeMinutes"
                        }
                    }
                }
            ]).session(session);

            const data = stats[0] || {};

            /* --------------------------------
               4. Salary Calculation
            -------------------------------- */

            const salary = emp.salaryStructure;

            const perDay = salary.perDay || 0;
            const perHour = salary.perHour || 0;
            const otRate = salary.overtimeRate || 0;

            const paidDays =
                (data.present || 0) +
                (data.halfDay || 0) * 0.5 +
                (data.holiday || 0);

            const basePay = paidDays * perDay;

            const overtimePay =
                ((data.overtimeMinutes || 0) / 60) * otRate;

            const gross =
                basePay +
                overtimePay +
                (salary.bonus || 0);

            /* --- Deductions (Example) --- */

            const deductions =
                (data.absent || 0) * perDay * 0.5;

            const net = gross - deductions;

            /* --------------------------------
               5. Create Payroll
            -------------------------------- */

            await Payroll.create([{
                companyId: emp.companyId,
                employeeId: emp._id,
                month: monthKey,

                salary: {
                    basic: salary.basic,
                    hra: salary.hra,
                    da: salary.da,
                    bonus: salary.bonus,

                    overtimePay,

                    gross,
                    deductions,
                    net
                },

                attendanceSummary: {
                    presentDays: data.present || 0,
                    halfDays: data.halfDay || 0,
                    leaveDays: data.leave || 0,
                    holidays: data.holiday || 0,
                    absentDays: data.absent || 0,

                    totalMinutes: data.totalMinutes || 0,
                    overtimeMinutes: data.overtimeMinutes || 0
                },

                generatedAt: new Date()
            }], { session });

        }

        /* ---------------------------------------
           6. Commit
        --------------------------------------- */

        await session.commitTransaction();
        session.endSession();

        console.log("✅ Payroll Generated Successfully");

    } catch (err) {

        await session.abortTransaction();
        session.endSession();

        console.error("❌ Payroll Cron Failed", err);
    }
}

/* ===========================================
   Schedule (1st of Every Month 2 AM)
=========================================== */

export function startPayrollCron() {

    cron.schedule("0 2 1 * *", async () => {
        await runPayroll();
    });

    console.log("📅 Payroll Cron Scheduled (1st, 02:00 AM)");
}
