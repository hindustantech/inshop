import express from "express";
import {
    createCategory,
    updateCategory,
    deleteCategory,
    toggleCategoryStatus,
    getAllCategories,
    getCategoryById,
    getActiveCategories
} from "../../controllers/attandance/Advertismentcategory.js";
import authMiddleware from "../../middlewares/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", getAllCategories);
router.get("/active", getActiveCategories);
router.get("/:id", getCategoryById);

// Admin routes
router.post("/", authMiddleware, createCategory);
router.put("/:id", authMiddleware, updateCategory);
router.delete("/:id", authMiddleware, deleteCategory);
router.patch("/:id/toggle-status", authMiddleware, toggleCategoryStatus);

export default router;