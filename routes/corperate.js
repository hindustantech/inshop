import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
    createCorporateRequest,
    updateCorporateRequestStatus,
    getCorporateRequestById,
    getAllCorporateRequests,
    getMyCorporateRequests,
    toggleCorporateUser
} from '../controllers/corparete.js';
const router = express.Router();


router.post("/corporate-request", authMiddleware, createCorporateRequest);

router.patch(
    "/users/:userId/corporate",
    authMiddleware,
    toggleCorporateUser       
);
router.patch("/corporate-request/:requestId/status", authMiddleware, updateCorporateRequestStatus);

router.get("/corporate-request/:requestId", authMiddleware, getCorporateRequestById);

router.get("/admin/corporate-requests", authMiddleware, getAllCorporateRequests);

router.get("/my/corporate-requests", authMiddleware, getMyCorporateRequests);

// Route to get all corporate users (admin only)
// router.get('/corperate-users', authMiddleware, getCorperateUsers);
export default router;
