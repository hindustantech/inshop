import express from "express";
import multer from "multer";
import { createOrUpdateProfile,getProfile } from "../controllers/PatnerProfile.js";
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();
const upload = multer(); // memory storage (for buffer upload)

// Create or Update Profile with Cloudinary logo
router.post("/", upload.single("logo"), authMiddleware,createOrUpdateProfile);

// Get Profile by User ID
router.get("/:userId", getProfile);

export default router;
