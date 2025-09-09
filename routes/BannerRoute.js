import express from 'express';
import { createBanner } from '../controllers/BannerController.js';
import multer from 'multer';
const router = express.Router();

const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });



router.post('/createbanner', upload.single("images"), createBanner);

export default router;
