import express from "express";
import { getPromotionalBanners, getAllPromotionalBanners, createPromotionalBanner, updatePromotionalBanner, deletePromotionalBanner, toggleBannerStatus } from "../controllers/promotionalBannerController.js";
import { authMiddleware1 } from "../middlewares/checkuser.js";
import multer from 'multer';
import authMiddleware from "../middlewares/authMiddleware.js";
import { checkPermission } from "../middlewares/checkPermission.js";
import { singleFileUpload } from "../middlewares/multer.js";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
    },


});


router.post("/", authMiddleware, checkPermission('promotional.create'), singleFileUpload, createPromotionalBanner);

router.post("/", upload.single('bannerImage'), authMiddleware, checkPermission('promotional.create'), createPromotionalBanner);
router.put("/:id", authMiddleware, checkPermission('promotional.update'), updatePromotionalBanner);
router.delete("/:id", authMiddleware, checkPermission('promotional.delete'), deletePromotionalBanner);
router.patch("/:id/status", authMiddleware, checkPermission('promotional.update'), toggleBannerStatus);
router.get("/", getAllPromotionalBanners);
router.get('/my-banners', authMiddleware1, getPromotionalBanners);

export default router;