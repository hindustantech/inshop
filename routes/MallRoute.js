import express from 'express';
import {
    getMallsWithUserLocation,
    createOrUpdateMall,
    getMallshop,
    addintomall
} from '../controllers/MallController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

// Endpoint: GET /api/malls/getMalls
router.get('/getMalls', authMiddleware, getMallsWithUserLocation);
router.post('/createOrUpdateMall', createOrUpdateMall);
router.get('/getMallshop', getMallshop);
// router.get('/addintomall', authMiddleware, checkPermission(assing.add), addintomall);
router.get('/addintomall', authMiddleware, addintomall);

export default router;
