import express from 'express'
import { SendNotification } from '../controllers/SendNotification.js'
import authMiddleware from '../middlewares/authMiddleware.js';
const router = express.Router();

router.post('/SendNotification', authMiddleware, SendNotification);

export default router