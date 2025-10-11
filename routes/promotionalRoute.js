import express from "express";
import { getPromotionalBanners, getAllPromotionalBanners, createPromotionalBanner, updatePromotionalBanner, deletePromotionalBanner, toggleBannerStatus } from "../controllers/promotionalBannerController.js";
import { authMiddleware1 } from "../middlewares/checkuser.js";
import multer from 'multer';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
    },
});

router.post("/", upload.single('bannerImage'), createPromotionalBanner);
router.put("/:id", updatePromotionalBanner);
router.delete("/:id", deletePromotionalBanner);
router.patch("/:id/status", toggleBannerStatus);
router.get("/", getAllPromotionalBanners);
router.get('/my-banners', authMiddleware1, getPromotionalBanners);

export default router;