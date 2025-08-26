import express from 'express';
import { downloadUser, downloadCoupon } from '../controllers/downloadController.js';
import { getCouponReport } from '../controllers/downloadController.js';
import { getUserReport } from '../controllers/downloadController.js';

const router = express.Router();

router.get('/users', downloadUser);
router.get('/coupons', downloadCoupon);
router.get('/getusers', getUserReport);
router.get('/getcoupons', getCouponReport);

export default router;
