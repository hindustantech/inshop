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

dotenv.config();
connectDB();

const app = express();

app.set('view engine', 'ejs');
app.use(express.json({ limit: "50mb" }));          // For JSON requests
app.use(express.urlencoded({ limit: "50mb", extended: true })); // For 

// Configure CORS (Allow all origins by default)
app.use(cors());

// Test route
// ---------------------------
app.get('/', (req, res) => {
  res.send('inshop is Running Smoothly!');
});

// app.get('/', (req, res) => {
//   const filePath = path.resolve('public/index.html');
//   res.sendFile(filePath);
// });
// app.get('/home', (req, res) => {
//   const filePath = path.resolve('public/index.html'); // Adjust path if necessary
//   res.sendFile(filePath);
// });
// app.get('/reports', (req, res) => {
//   const filePath = path.resolve('public/reports.html'); // Adjust path if necessary
//   res.sendFile(filePath);
// });
// AdminJS setup

app.use('/admin', adminRouter);
app.use('/api/usermanagement', usermanagement);
app.use('/api/adRoute', adroute);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/agencypatner', agencypatner);
// API routes
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

// payment route
app.use('/api/paymentroute', paymentroute);

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
