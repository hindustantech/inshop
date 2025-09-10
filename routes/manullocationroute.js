import express from 'express';
import { createManualAddress, getAllManualAddresses } from '../controllers/manuladdress.js';

const router = express.Router();
router.post('/createManualAddress', createManualAddress)
router.get('/getAllManualAddresses', getAllManualAddresses)

export default router;