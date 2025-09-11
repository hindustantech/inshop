import express from "express";
import {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
} from "../controllers/category.js";

const router = express.Router();

// Create new category
router.post("/createCategory", createCategory);

// Get all categories (with pagination, search, active filter)
router.get("/getCategories", getCategories);

// Get single category by ID
router.get("/getCategoryById/:id", getCategoryById);

// Update category
router.put("/updateCategory/:id", updateCategory);

// Deactivate category (soft delete)
router.delete("/deleteCategory/:id", deleteCategory);

export default router;
