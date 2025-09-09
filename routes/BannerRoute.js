import express from 'express';
import { createBanner,getUserNearestBanners } from '../controllers/BannerController.js';
import multer from 'multer';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });



router.post('/createbanner', authMiddleware, upload.single("images"), createBanner);
router.get('/getbanner', authMiddleware, getUserNearestBanners);

export default router;
