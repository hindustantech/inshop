import express from 'express';
import {
    signup,
    updateUserLocation,
    verifyOtp,
    login,
    resendOtp,
    signout,
    forgotPassword,
    resetPassword,
    updateProfile,
    getProfileData,
    uploadProfileImage,
    getOwner,
    getProfileImageUrl
} from '../controllers/authController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import profileUploadMiddleware from '../middlewares/profileUploadMiddleware.js';
const router = express.Router();

router.post('/signup', signup);
router.post('/updateUserLocation', authMiddleware, updateUserLocation);
router.post('/verifyOtp', verifyOtp);
router.post('/login', login);
router.post('/resendOtp', resendOtp);
router.post('/signout', signout);
router.post('/signout', signout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.put('/update-profile', authMiddleware, updateProfile);
router.get('/profile-data', authMiddleware, getProfileData);
router.get('/getOwner/:ownerId', authMiddleware, getOwner);

router.post('/upload-profile-image', authMiddleware, profileUploadMiddleware, uploadProfileImage);
router.get('/profile-image-url', authMiddleware, profileUploadMiddleware, getProfileImageUrl);

export default router;
