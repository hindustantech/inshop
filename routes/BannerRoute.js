import express from 'express';
import { createBanner, getUserNearestBanners, getMyBanners, getAllBannersForAdmin, getBannerById, updateBannerExpiry } from '../controllers/BannerController.js';
import multer from 'multer';
import authMiddleware from '../middlewares/authMiddleware.js';
import { authMiddleware1 } from '../middlewares/checkuser.js';

const router = express.Router();

const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });



router.post('/createbanner', authMiddleware, upload.single("images"), createBanner);
router.get('/getbanner', authMiddleware1, getUserNearestBanners);

router.get("/banners/my", authMiddleware, getMyBanners);
router.get("/banners/admin", authMiddleware, getAllBannersForAdmin);
router.get("/getdeatils/:bannerId", getBannerById);
router.patch("/updateBannerExpiry", updateBannerExpiry);

export default router;
