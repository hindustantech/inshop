import express from 'express';
import { createAd, getAllAds, updateAd } from '../controllers/AdController.js';

const router = express.Router();

// ➕ Create a new Ad
router.post('/create', createAd);

// 📄 Get all Ads
router.get('/', getAllAds);

// ✏️ Update an Ad by ID
router.put('/update/:id', updateAd);

export default router;
