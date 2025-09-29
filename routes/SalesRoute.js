import express from "express";
import { getSales, completeSale, cancelSale,getSalesByCouponOwner,getOngoingServices } from "../controllers/couponController.js";
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

router.get('/getSales', authMiddleware, getSales);
router.get('/getOngoingServices', authMiddleware, getOngoingServices);

router.post('/completeSale', completeSale);
router.post('/cancelSale', authMiddleware, cancelSale);
router.get('/getSalesByCouponOwner', authMiddleware, getSalesByCouponOwner);
export default router;
