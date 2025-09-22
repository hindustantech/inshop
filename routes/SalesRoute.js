import express from "express";
import { getSales, completeSale, cancelSale,getSalesByCouponOwner } from "../controllers/couponController.js";
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

router.get('/getSales', authMiddleware, getSales);

router.post('/completeSale', authMiddleware, completeSale);
router.post('/cancelSale', authMiddleware, cancelSale);
router.post('/getSalesByCouponOwner', authMiddleware, getSalesByCouponOwner);
export default router;
