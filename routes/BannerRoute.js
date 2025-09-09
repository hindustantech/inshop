import express from 'express';
import { createBanner } from '../controllers/BannerController.js';
import multer from 'multer';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });



router.post('/createbanner', authMiddleware, upload.single("images"), createBanner);

export default router;
