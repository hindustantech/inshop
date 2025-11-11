import express from 'express';
import { getMallsWithUserLocation } from '../controllers/MallController.js';

const router = express.Router();

// Endpoint: GET /api/malls/getMalls
router.get('/getMalls', getMallsWithUserLocation);

export default router;
