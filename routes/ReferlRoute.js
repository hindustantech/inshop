import express from "express";
import { getCompletedSalesByReferral,getReferralUsersByDate } from "../controllers/ReferalUsed.js";
const router = express.Router();

router.post("/getCompletedSalesByReferral", getCompletedSalesByReferral);
router.post("/getReferralUsersByDate", getReferralUsersByDate);

export default router;
