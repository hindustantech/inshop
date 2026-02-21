import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

import connectDB from './config/db.js';
import path from 'path';
import authRoutes from './routes/authRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import linkRoutes from './routes/linkRoutes.js';
import generalRoutes from './routes/generalRoutes.js';
import landingRoutes from './routes/landingRoutes.js';
import adminRouter from './config/adminPanel.js';
import downloadRoutes from './routes/downloadRoutes.js';
import sendnotification from './routes/SendNotificationRoute.js'
import fs from 'fs';
import banner from './routes/BannerRoute.js'
import manuladdress from './routes/manullocationroute.js';
import Categoryroute from './routes/Category.js'
import usermanagement from './routes/userManagementRoutes.js'
import patnerProfile from './routes/PatnerProfile.js'
import salesRoute from './routes/SalesRoute.js'
import adroute from './routes/AdRoute.js'
import analyticsRoutes from './routes/analyticsRoutes.js'
import agencypatner from './routes/userRoutes.js'
import PromotionalBanner from './routes/promotionalRoute.js';
import notification from './routes/notificationRoutes.js';
import Referal from './routes/ReferlRoute.js'
import './controllers/crronjob.js'
import agencyDashboardRoutes from './routes/agencyDashboardRoutes.js';
import permissionRoutes from './routes/permissionRoutes.js';
import paymentroute from './routes/paymentRoutes.js';
import dashroute from './routes/Dashboard.js'
import mall from './routes/MallRoute.js'
import chunkuploadimage from './routes/uploadRoutes.js'
import qrgenerater from './routes/qr.route.js'
import wallet from './routes/walletRoutes.js'
import { razorpayWebhookHandler } from './controllers/webhookController.js';
import { rawBodyMiddleware } from './middlewares/rawBody.js'
import comment from './routes/comment.route.js'
import planRoutes from './routes/plan.routes.js'
import supports from './routes/supoort.js'
import scanTounluck from './routes/unlockRoute.js'
import giftHamperRoutes from './routes/GiftHamper.route.js';
import corporateRoutes from './routes/corperate.js'
import appsettingroutes from './routes/appsetting.js'


import holiday from './routes/Attandance/Holiday.js'
import attandance from './routes/Attandance/Attandance.js'
import employee from './routes/Attandance/Employee.route.js'
// import './cron/referralSummary.cron.js'
// import './controllers/crronjob.js'
// import { startCouponApprovalWorker } from './controllers/couponController.js';
dotenv.config();
await connectDB();

// START BACKGROUND WORKER HERE
// startCouponApprovalWorker();

const app = express();

app.set('view engine', 'ejs');
// Configure CORS (Allow all origins by default)
app.use(cors());
app.post(
  "/api/wallet/webhook/razorpay",
  rawBodyMiddleware,
  razorpayWebhookHandler
);
app.use(express.json({ limit: "50mb" }));          // For JSON requests
app.use(express.urlencoded({ limit: "50mb", extended: true })); // For 



// Test route
// ---------------------------
app.get('/', (req, res) => {
  res.send('inshop is Running Smoothly!');
});
app.use(
  "/exports",
  express.static(path.join(process.cwd(), "exports"))
);

app.use('/admin', adminRouter);
app.use('/api/usermanagement', usermanagement);
app.use('/api/adRoute', adroute);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/agencypatner', agencypatner);
app.use('/api/holiday', holiday);
app.use('/api/attendance', attandance);
app.use('/api/employee', employee);
// API routes
app.use("/api/gift-hampers", giftHamperRoutes);
app.use("/api/corporateRoutes", corporateRoutes);
app.use('/api/appsetting', appsettingroutes);
app.use('/api/auth', authRoutes);
app.use('/api/coupon', couponRoutes);
app.use('/api/link', linkRoutes);
app.use('/api/info', generalRoutes);
app.use('/api/landing', landingRoutes);
app.use('/download', downloadRoutes);
app.use('/api/send', sendnotification);
app.use('/api/notification', notification);
app.use('/api/banner', banner);
app.use('/api/qrgenerater', qrgenerater);

app.use('/api/PromotionalBanner', PromotionalBanner);
app.use('/api', chunkuploadimage);


app.use('/api/manul', manuladdress);
app.use('/api/category', Categoryroute);
app.use('/api/patnerProfile', patnerProfile);
app.use('/api/salesRoute', salesRoute);
app.use('/api/referal', Referal);
app.use('/api/mall', mall);

app.use('/api/dashroute', dashroute);
app.use('/api/wallet', wallet);
app.use('/api/planRoutes', planRoutes);
app.use('/api/scanTounluck', scanTounluck);

// payment 
app.use('/api/paymentroute', paymentroute);
app.use('/api/comment', comment);
app.use('/api/support', supports);

app.use('/api/agency', agencyDashboardRoutes);
app.use('/api/permissionRoutes', permissionRoutes);
// Add this after your existing middleware setup
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads/links')) {
  fs.mkdirSync('uploads/links', { recursive: true });
}

// app.get('/link-dashboard', (req, res) => {
//   const filePath = path.resolve('public/linkDashboard.html');
//   res.sendFile(filePath);
// });

// Start server

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on  ${PORT}`));
