// models/Payroll.js

import mongoose from "mongoose";

const payrollSchema = new mongoose.Schema({

    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    month: {
        type: Number,
        required: true
    },

    year: {
        type: Number,
        required: true
    },

    attendanceSummary: {
        presentDays: Number,
        absentDays: Number,
        paidLeaves: Number,
        paidHolidays: Number,

        totalHours: Number,
        overtimeHours: Number
    },

    earnings: {
        basic: Number,
        hra: Number,
        da: Number,
        bonus: Number,
        overtimePay: Number,
        incentives: Number
    },



    totals: {
        grossSalary: Number,
        totalDeduction: Number,
        netSalary: Number
    },

    payslipUrl: String,

    status: {
        type: String,
        enum: ["draft", "processed", "paid", "locked"],
        default: "draft"
    },

    paymentInfo: {
        paidAt: Date,
        transactionId: String,
        mode: String
    }

}, {
    timestamps: true
});

payrollSchema.index(
    { companyId: 1, employeeId: 1, month: 1, year: 1 },
    { unique: true }
);

export default mongoose.model("Payroll", payrollSchema);
