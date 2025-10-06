import express from "express";
import { getCompletedSalesByReferral,getReferralUsersByDate } from "../controllers/ReferalUsed";
const router = express.Router();

router.get("/getCompletedSalesByReferral", getCompletedSalesByReferral);
router.get("/getReferralUsersByDate", getReferralUsersByDate);

export default router;
