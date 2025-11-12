import express from 'express';
import { getMallsWithUserLocation, createOrUpdateMall, getMallshop } from '../controllers/MallController.js';

const router = express.Router();

// Endpoint: GET /api/malls/getMalls
router.get('/getMalls', getMallsWithUserLocation);
router.get('/getMalls', createOrUpdateMall);
router.get('/getMalls', getMallshop);

export default router;
