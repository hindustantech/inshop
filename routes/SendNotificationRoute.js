import express from 'express'
import { SendNotification } from '../controllers/SendNotification.js'
import { broadcastNotification } from '../controllers/authController.js'
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

router.post('/SendNotification', authMiddleware, SendNotification);
router.post('/broadcastNotification', broadcastNotification);

export default router