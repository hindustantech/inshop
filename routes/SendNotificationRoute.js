import express from 'express'
import { SendNotification } from '../controllers/SendNotification.js'
import { broadcastNotification } from '../controllers/authController.js'
import authMiddleware from '../middlewares/authMiddleware.js';
import { checkPermission } from '../middlewares/checkPermission.js';
const router = express.Router();

router.post('/SendNotification', authMiddleware, SendNotification);
router.post('/broadcastNotification', authMiddleware, checkPermission('broadcast.create'), broadcastNotification);

export default router