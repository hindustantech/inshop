import express from 'express';
import {
assignPermission,
removePermission,
getUserPermissions
} from '../controllers/permissionController.jspermissionController.js';
import {
    checkPermission
} from '../middlewares/checkPermission.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

// Only admins can assign/remove permissions
router.post('/assign', authMiddleware, checkPermission('permission.assign'), assignPermission);
router.post('/remove', authMiddleware, checkPermission('permission.assign'), removePermission);

// Any admin can view
router.get('/:userId', authMiddleware, checkPermission('permission.read'), getUserPermissions);

export default router;
