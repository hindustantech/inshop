// routes/userRoutes.js
import express from 'express';
import {
    getAllUsers,
    exportUsers,
    getUserAnalytics,
    getUserProfile,
    changeUserRole,
    toggleUserBlock,
    createUser
} from '../controllers/Usermanagement.js';

// Assume auth middleware if needed, e.g., const auth = require('../middleware/auth');
// router.use(auth);

const router = express.Router();

// User management routes
router.get('/', getAllUsers); // All users with filters/pagination
router.post('/', createUser); // Add user
router.get('/export', exportUsers); // Export users
router.get('/analytics', getUserAnalytics); // Analytics
router.get('/:id', getUserProfile); // View profile
router.put('/:id/role', changeUserRole); // Change role
router.put('/:id/block', toggleUserBlock); // Block/unblock

export default router;