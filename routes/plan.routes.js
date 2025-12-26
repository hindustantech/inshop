import express from "express";
import {
    createPlan,
    getPlans,
    getPlanById,
    disablePlan,
    updatePlan ,
    
} from "../controllers/plan.controller.js";

// import auth from "../middlewares/auth.js";
// import admin from "../middlewares/admin.js";

const router = express.Router();

// Admin
router.post("/", /* auth, admin, */ createPlan);
router.patch("/:id/disable", /* auth, admin, */ disablePlan);
router.patch("/:id", /* auth, admin, */ updatePlan);

// Public
router.get("/", getPlans);
router.get("/:id", getPlanById);

export default router;
