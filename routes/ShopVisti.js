// routes/v1/shopVisitRoutes.js
import express from "express";

import {
    createShopVisit,
    getAllShopVisits,
    exportShopVisitsToCSV,
    getShopVisitById,
    updateShopVisit,
    deleteShopVisit,
    getShopVisitStats,
    searchcouopn,
} from "../controllers/ShopVisit.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import { checkPermission } from "../middlewares/checkPermission.js";
const router = express.Router();

// Apply authentication to all routes
router.use(authMiddleware);

// Public routes (accessible to all authenticated users)
router.get("/coupons/search", searchcouopn);
router.get("/stats", getShopVisitStats);
router.get("/export",checkPermission('export.shop'), exportShopVisitsToCSV);

// Admin only routes (optional - add role-based access)
router.post("/", checkPermission('create.shop'), createShopVisit);
router.put("/:id", checkPermission('update.shop'), updateShopVisit);
router.delete("/:id", checkPermission('delete.shop'), deleteShopVisit);

// Regular routes
router.get("/", getAllShopVisits);
router.get("/:id", getShopVisitById);

export default router;