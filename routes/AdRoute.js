import express from 'express';
import { getAdUserCityByCopunWithGeo, getBannersByLocation, createAd, getAllAds, updateAd, addOrUpdateAds, appendAds, removeAds, bulkUpdateAds } from '../controllers/AdController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { authMiddleware1 } from '../middlewares/checkuser.js';
const router = express.Router();

// ➕ Create a new Ad
router.post('/create', createAd);

// 📄 Get all Ads
router.get('/', getAllAds);

// ✏️ Update an Ad by ID
router.put('/update/:id', updateAd);



// Regular users and super admin can use these
router.put('/ads', authMiddleware, addOrUpdateAds);
router.patch('/ads/append', authMiddleware, appendAds);
router.patch('/ads/remove', authMiddleware, removeAds);

// Only super admin can use bulk operations
router.patch('/ads/bulk', authMiddleware, bulkUpdateAds);
router.get('/getAdUserCityByCopunWithGeo', authMiddleware1, getAdUserCityByCopunWithGeo);
router.get('/getBannersByLocation', authMiddleware1, getBannersByLocation);

export default router;
