import express from "express";
import { createOrder, verifyPayment } from "../controllers/Paymentgetway.js";
import authMiddleware from "../middlewares/authMiddleware.js";
const router = express.Router();

router.post("/create-order", authMiddleware, createOrder);
router.post("/verify-payment", authMiddleware, verifyPayment);

export default router;
