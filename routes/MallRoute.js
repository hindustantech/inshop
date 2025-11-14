import express from 'express';
import {
    getMallsWithUserLocation,
    createOrUpdateMall,
    getMallshop,
    addintomall,
    getAllMall,
    getPartnerByPhone,
    getMallshopCoupon,
    getMallshopBanner
} from '../controllers/MallController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import { authMiddleware1 } from '../middlewares/checkuser.js'
import { uploadMallFiles } from '../utils/uploadFiles.js';
const router = express.Router();

// Endpoint: GET /api/malls/getMalls
router.get('/getMalls', authMiddleware1, getMallsWithUserLocation);
router.post("/createOrUpdateMall", uploadMallFiles, createOrUpdateMall);
router.get('/getMallshop', getMallshop);
// router.get('/addintomall', authMiddleware, checkPermission(assing.add), addintomall);
router.get('/addintomall', authMiddleware, addintomall);
router.get('/getAllMall', authMiddleware, getAllMall);
router.get('/getPartnerByPhone', authMiddleware, getPartnerByPhone);

router.get('/getMallshopCoupon', getMallshopCoupon);
router.get('/getMallshopBanner', getMallshopBanner);

export default router;
