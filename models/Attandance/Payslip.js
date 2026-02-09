import mongoose from "mongoose";

const payslipSchema = new mongoose.Schema({

    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true
    },

    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee"
    },

    payrollId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payroll"
    },

    month: {
        type: String, // 2026-01
        index: true
    },

    filePath: String,

    generatedAt: Date,

    status: {
        type: String,
        enum: ["generated", "emailed"],
        default: "generated"
    }

}, { timestamps: true });

payslipSchema.index(
    { companyId: 1, employeeId: 1, month: 1 },
    { unique: true }
);

export default mongoose.model("Payslip", payslipSchema);
