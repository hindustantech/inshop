import express from 'express';
import { updateBanner,createBanneradmin, createBanner, getUserNearestBanners, getMyBanners, getAllBannersForAdmin, getBannerById, updateBannerExpiry } from '../controllers/BannerController.js';
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
router.delete('/deletebanner/:id', authMiddleware, checkPermission('banner.delete'),checkPermission('banner.delete'), async (req, res) => {
    // Implement delete banner logic here
    res.status(200).json({ message: 'Banner deleted successfully' });
});


router.get('/getbanner', authMiddleware1, getUserNearestBanners);


router.get("/banners/my", authMiddleware, getMyBanners);
router.get("/banners/admin", authMiddleware, getAllBannersForAdmin);
router.get("/getdeatils/:bannerId", getBannerById);
router.patch("/updateBannerExpiry/:id", authMiddleware,checkPermission('banner.update'),updateBannerExpiry);

export default router;
