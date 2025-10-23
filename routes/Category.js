// routes/category.js
import express from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  toggleCategory,
} from "../controllers/category.js";
import optionalAuth from "../middlewares/optionalAuth.js";
import { checkPermission } from "../middlewares/checkPermission.js";
const router = express.Router();

// Create new category (requires authentication, adjust as needed)
router.post("/createCategory", optionalAuth, checkPermission('category.create'), createCategory);

// Get all categories (with pagination, search, and optional auth)
router.get("/getCategories", optionalAuth,  getCategories);

// Get single category by ID
router.get("/getCategoryById/:id", optionalAuth, getCategoryById);

// Update category (requires authentication, adjust as needed)
router.put("/updateCategory/:id", optionalAuth, checkPermission('category.update'), updateCategory);

// Toggle category status (requires super_admin, adjust middleware as needed)
router.patch("/toggleCategory/:id", optionalAuth, checkPermission('category.update'), toggleCategory);

export default router;