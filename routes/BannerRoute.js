import express from 'express';
import { deleteBanner, updateBanner, createBanneradmin, createBanner, toggleBannerActive, getUserNearestBanners, getMyBanners, getAllBannersForAdmin, getBannerById, updateBannerExpiry } from '../controllers/BannerController.js';
import multer from 'multer';
import authMiddleware from '../middlewares/authMiddleware.js';
import { authMiddleware1 } from '../middlewares/checkuser.js';

import { checkPermission } from '../middlewares/checkPermission.js';

const router = express.Router();

const storage = multer.memoryStorage(); // ✅ stores buffer in memory

const upload = multer({ storage });



router.post('/createbanner', authMiddleware, upload.single("images"), createBanner);
router.post('/createBanneradmin', authMiddleware, upload.single("images"), checkPermission('banner.create'), createBanneradmin);

router.put('/updatebanner/:id', authMiddleware, upload.single('images'), checkPermission('banner.update'), updateBanner);
router.delete('/deletebanner/:id', authMiddleware, checkPermission('banner.delete'), deleteBanner);


router.get('/getbanner', authMiddleware1, getUserNearestBanners);


router.get("/banners/my", authMiddleware, getMyBanners);
router.get("/banners/admin", authMiddleware, getAllBannersForAdmin);
router.get("/getdeatils/:bannerId", authMiddleware, getBannerById);
router.patch("/updateBannerExpiry/:id", authMiddleware, checkPermission('banner.update'), updateBannerExpiry);
router.patch("/toggleBannerActive/:bannerId", authMiddleware, checkPermission('banner.update'), toggleBannerActive);

export default router;
