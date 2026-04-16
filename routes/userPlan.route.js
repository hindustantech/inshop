// routes/userPlan.routes.js

import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { getUserPlanAccess } from "../controllers/userPlan.controller";

const router = express.Router();

router.get("/access", authMiddleware, getUserPlanAccess);

export default router;