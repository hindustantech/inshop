// routes/category.js
import express from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  toggleCategory,
} from "../controllers/category.js";

const router = express.Router();

// Create new category
router.post("/createCategory", createCategory);

// Get all categories (with pagination, search)
router.get("/getCategories", getCategories);

// Get single category by ID
router.get("/getCategoryById/:id", getCategoryById);

// Update category
router.put("/updateCategory/:id", updateCategory);

// Toggle category status (replaces delete)
router.patch("/toggleCategory/:id", toggleCategory);

export default router;