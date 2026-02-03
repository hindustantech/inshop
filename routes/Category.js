// routes/category.js
import express from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  toggleCategory,
  convetintoOccasion,
  getActiveOccasionCategories,
} from "../controllers/category.js";
import optionalAuth from "../middlewares/optionalAuth.js";
import { checkPermission } from "../middlewares/checkPermission.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import multer from "multer";
const router = express.Router();

const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });

// Create new category (requires authentication, adjust as needed)
router.post("/createCategory", authMiddleware, checkPermission('category.create'), upload.single("image"), createCategory);

// Get all categories (with pagination, search, and optional auth)
router.get("/getCategories", optionalAuth, getCategories);
router.get("/getActiveOccasionCategories", optionalAuth, getActiveOccasionCategories);

// Get single category by ID
router.get("/getCategoryById/:id", optionalAuth, getCategoryById);

// Update category (requires authentication, adjust as needed)
router.put("/updateCategory/:id", optionalAuth, checkPermission('category.update'),  upload.single("image"),updateCategory);

// Toggle category status (requires super_admin, adjust middleware as needed)
router.patch("/toggleCategory/:id", optionalAuth, checkPermission('category.update'), toggleCategory);
router.patch("/convetintoOccasion/:id", optionalAuth, checkPermission('category.update'), convetintoOccasion);

export default router;