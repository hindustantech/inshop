import express from 'express';
import { createBanner } from '../controllers/BannerController.js';

const router = express.Router();

router.post('/createbanner', createBanner);

export default router;
