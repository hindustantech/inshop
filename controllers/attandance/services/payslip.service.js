import PDFDocument from "pdfkit";
import fs from "fs-extra";
import path from "path";
import moment from "moment";

/* ======================================
   Payslip PDF Generator
====================================== */

export async function generatePayslipPDF({
    company,
    employee,
    payroll
}) {

    /* -------------------------------
       Folder Setup
    ------------------------------- */

    const baseDir = "storage/payslips";

    const dir = path.join(
        baseDir,
        payroll.month,
        employee._id.toString()
    );

    await fs.ensureDir(dir);

    const fileName = `payslip-${payroll.month}.pdf`;
    const filePath = path.join(dir, fileName);

    /* -------------------------------
       Create PDF
    ------------------------------- */

    const doc = new PDFDocument({
        size: "A4",
        margin: 40
    });

    doc.pipe(fs.createWriteStream(filePath));

    /* -------------------------------
       Header
    ------------------------------- */

    doc
        .fontSize(20)
        .text(company.name, { align: "center" });

    doc
        .fontSize(11)
        .text(company.address, { align: "center" });

    doc.moveDown(1);

    doc
        .fontSize(16)
        .text("PAYSLIP", { align: "center" });

    doc
        .fontSize(11)
        .text(`For Month: ${payroll.month}`, {
            align: "center"
        });

    doc.moveDown(2);

    /* -------------------------------
       Employee Details
    ------------------------------- */

    sectionTitle(doc, "Employee Information");

    twoColumnRow(doc,
        "Employee Name", employee.userId.name,
        "Employee Code", employee.empCode
    );

    twoColumnRow(doc,
        "Department", employee.jobInfo.department,
        "Designation", employee.jobInfo.designation
    );

    twoColumnRow(doc,
        "Bank A/C", employee.bankDetails.accountNo,
        "IFSC", employee.bankDetails.ifsc
    );

    doc.moveDown();

    /* -------------------------------
       Attendance Summary
    ------------------------------- */

    sectionTitle(doc, "Attendance Summary");

    twoColumnRow(doc,
        "Present Days", payroll.attendanceSummary.presentDays,
        "Half Days", payroll.attendanceSummary.halfDays
    );

    twoColumnRow(doc,
        "Leave Days", payroll.attendanceSummary.leaveDays,
        "Holidays", payroll.attendanceSummary.holidays
    );

    twoColumnRow(doc,
        "Absent Days", payroll.attendanceSummary.absentDays,
        "Overtime (Min)", payroll.attendanceSummary.overtimeMinutes
    );

    doc.moveDown();

    /* -------------------------------
       Salary Details
    ------------------------------- */

    sectionTitle(doc, "Salary Details");

    salaryRow(doc, "Basic", payroll.salary.basic);
    salaryRow(doc, "HRA", payroll.salary.hra);
    salaryRow(doc, "DA", payroll.salary.da);
    salaryRow(doc, "Bonus", payroll.salary.bonus);
    salaryRow(doc, "Overtime Pay", payroll.salary.overtimePay);

    doc.moveDown();

    sectionTitle(doc, "Deductions");

    salaryRow(doc, "Total Deductions", payroll.salary.deductions);

    doc.moveDown();

    sectionTitle(doc, "Net Salary");

    doc
        .fontSize(14)
        .text(
            `₹ ${payroll.salary.net.toFixed(2)}`,
            { align: "right" }
        );

    doc.moveDown(2);

    /* -------------------------------
       Footer
    ------------------------------- */

    doc
        .fontSize(9)
        .text(
            "This is a system-generated payslip and does not require signature.",
            { align: "center" }
        );

    doc
        .fontSize(9)
        .text(
            `Generated On: ${moment().format("DD-MM-YYYY HH:mm")}`,
            { align: "center" }
        );

    doc.end();

    return filePath;
}

/* ======================================
   Helpers
====================================== */

function sectionTitle(doc, title) {

    doc
        .fontSize(13)
        .text(title, { underline: true });

    doc.moveDown(0.5);
}

function twoColumnRow(doc, l1, v1, l2, v2) {

    doc
        .fontSize(10)
        .text(`${l1}: ${v1}`, 40, doc.y, {
            width: 250
        });

    doc
        .text(`${l2}: ${v2}`, 320, doc.y);

    doc.moveDown();
}

function salaryRow(doc, label, value = 0) {

    doc
        .fontSize(10)
        .text(label, 40, doc.y);

    doc
        .text(`₹ ${value.toFixed(2)}`, 400, doc.y, {
            align: "right"
        });

    doc.moveDown();
}
