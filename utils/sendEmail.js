import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Set up the transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // Correct hostname for Gmail's SMTP
  port: 465, // Port for secure connections
  secure: true,
  auth: {
    user: process.env.EMAIL_ID, // Your Gmail email
    pass: process.env.EMAIL_LESS_SECURE_PASS, // Your Gmail password or App Password
  },
});

// Function to send the email
const sendEmail = async (to, subject, text) => {
  const mailOptions = {
    from: process.env.EMAIL_ID, // Sender address
    to: to, // Recipient address
    subject: subject, // Subject line
    text: text, // Plain text body
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
     
    } else {
     
    }
  });
};

export {sendEmail};
