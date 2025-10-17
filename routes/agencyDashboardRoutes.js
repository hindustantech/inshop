import express from 'express';
import { getAgencyDashboard } from '../controllers/agencyDashboardController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

// GET /api/agency/dashboard
router.get('/dashboard', authMiddleware, getAgencyDashboard);

export default router;