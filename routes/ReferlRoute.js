import express from "express";
import { getCompletedSalesByReferral,getReferralUsersByDate } from "../controllers/ReferalUsed.js";
const router = express.Router();

router.get("/getCompletedSalesByReferral", getCompletedSalesByReferral);
router.get("/getReferralUsersByDate", getReferralUsersByDate);

export default router;
