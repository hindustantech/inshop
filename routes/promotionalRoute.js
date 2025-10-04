import express from "express";
import { getPromotionalBanners, getAllPromotionalBanners, createPromotionalBanner, updatePromotionalBanner, deletePromotionalBanner, toggleBannerStatus } from "../controllers/promotionalBannerController.js"; 
import { authMiddleware1 } from "../middlewares/checkuser.js";
const router = express.Router();

router.post("/", createPromotionalBanner);
router.put("/:id", updatePromotionalBanner);
router.delete("/:id", deletePromotionalBanner);
router.patch("/:id/status", toggleBannerStatus);
router.get("/", getAllPromotionalBanners); // <-- Fetch with filters
router.get('/my-banners', authMiddleware1, getPromotionalBanners);

export default router;