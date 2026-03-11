import express from "express";
import {
    createAdvertisement,
    updateAdvertisement,
    deleteAdvertisement,
    toggleAdvertisementStatus,
    getActiveAdvertisements,
    getAllAdvertisements,
    getAdvertisementById,
    getAdvertisementsByCategory,
    bulkUpdateStatus,
    bulkDeleteAdvertisements
} from "../../controllers/attandance/advertisement.controller.js";
import authMiddleware from "../../middlewares/authMiddleware.js";
const router = express.Router();

// Public routes
router.get("/", getAllAdvertisements);
router.get("/active", getActiveAdvertisements);
router.get("/category/:categoryId", getAdvertisementsByCategory);
router.get("/:id", getAdvertisementById);

// Admin routes (protected)
router.post("/", authMiddleware, createAdvertisement);
router.put("/:id", authMiddleware, updateAdvertisement);
router.delete("/:id", authMiddleware, deleteAdvertisement);
router.patch("/:id/toggle-status", authMiddleware, toggleAdvertisementStatus);

// Bulk operations (admin only)
router.patch("/bulk/status", authMiddleware, bulkUpdateStatus);
router.delete("/bulk/delete", authMiddleware, bulkDeleteAdvertisements);

export default router;