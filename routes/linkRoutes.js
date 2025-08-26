import express from 'express';
import {
    createLink,
    getAllLinks,
    getLinkById,
    updateLink,
    deleteLink
} from '../controllers/linkController.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.post('/', upload.single('image'), createLink);
router.put('/:id', upload.single('image'), updateLink);
router.delete('/:id', deleteLink);
router.get('/', getAllLinks);
router.get('/:id', getLinkById);

export default router;
