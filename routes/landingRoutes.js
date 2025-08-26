import express from 'express';
import { getCoupon, getShops } from '../controllers/landingController.js';

const router = express.Router();

router.get('/get-coupuns', getCoupon);
router.get('/get-shops', getShops);

export default router;