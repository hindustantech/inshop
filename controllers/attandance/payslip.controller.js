import mongoose from "mongoose";
import Payroll from "../../models/Attandance/Payroll.js";
import Employee from "../../models/Attandance/Employee.js";
import Payslip from "../../models/Attandance/Payslip.js";
import { generatePayslipPDF } from "./services/payslip.service.js";

/* =========================================
   Generate Payslip
========================================= */

export const generatePayslip = async (req, res) => {

    try {

        const companyId = req.user.companyId;
        const { payrollId } = req.params;

        /* -------------------------------
           Fetch Payroll
        ------------------------------- */

        const payroll = await Payroll.findOne({
            _id: payrollId,
            companyId
        });

        if (!payroll) {
            return res.status(404).json({
                message: "Payroll not found"
            });
        }

        /* -------------------------------
           Prevent Duplicate
        ------------------------------- */

        const exists = await Payslip.findOne({
            payrollId
        });

        if (exists) {
            return res.json({
                message: "Payslip already generated",
                payslip: exists
            });
        }

        /* -------------------------------
           Fetch Employee
        ------------------------------- */

        const employee = await Employee.findById(
            payroll.employeeId
        ).populate("userId", "name email");

        /* -------------------------------
           Generate PDF
        ------------------------------- */

        const filePath = await generatePayslipPDF({
            company: req.user.companyProfile,
            employee,
            payroll
        });

        /* -------------------------------
           Save Record
        ------------------------------- */

        const payslip = await Payslip.create({

            companyId,
            employeeId: employee._id,
            payrollId: payroll._id,

            month: payroll.month,
            filePath,

            generatedAt: new Date()
        });

        return res.json({
            message: "Payslip generated",
            payslip
        });

    } catch (err) {

        console.error("Payslip Error:", err);

        res.status(500).json({
            message: "Failed to generate payslip",
            error: err.message
        });
    }
};
