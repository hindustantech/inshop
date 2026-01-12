import nodemailer from "nodemailer";

/**
 * Create reusable transporter
 * Use ENV variables only (no hardcoding)
 */
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,          // e.g. smtp.gmail.com
    port: process.env.EMAIL_PORT,          // 587
    secure: false,                         // true for 465
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Send Email (Transactional)
 */
export async function sendEmail({ to, subject, html }) {
    try {
        const mailOptions = {
            from: `"Referral Program" <${process.env.EMAIL_FROM}>`,
            to,
            subject,
            html,
        };

        const info = await transporter.sendMail(mailOptions);

        console.log(`Email sent to ${to} | messageId=${info.messageId}`);
        return info;
    } catch (error) {
        console.error("Email send failed:", error);
        throw error;
    }
}
