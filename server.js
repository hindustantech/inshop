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
import fs from 'fs';


dotenv.config();
connectDB();

const app = express();

app.set('view engine', 'ejs');
app.use(express.json());

// Configure CORS (Allow all origins by default)
app.use(cors());

// Test route
app.get('/', (req, res) => {
  const filePath = path.resolve('public/index.html');
  res.sendFile(filePath);
});
app.get('/home', (req, res) => {
  const filePath = path.resolve('public/index.html'); // Adjust path if necessary
  res.sendFile(filePath);
});
app.get('/reports', (req, res) => {
  const filePath = path.resolve('public/reports.html'); // Adjust path if necessary
  res.sendFile(filePath);
});
// AdminJS setup

app.use('/admin', adminRouter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/coupon', couponRoutes);
app.use('/api/link', linkRoutes);
app.use('/api/info', generalRoutes);
app.use('/api/landing', landingRoutes);
app.use('/download', downloadRoutes);

// Add this after your existing middleware setup
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads/links')) {
    fs.mkdirSync('uploads/links', { recursive: true });
}

app.get('/link-dashboard', (req, res) => {
  const filePath = path.resolve('public/linkDashboard.html');
  res.sendFile(filePath);
});

// Start server

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on  ${PORT}`));
