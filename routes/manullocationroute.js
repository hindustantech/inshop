import express from 'express';
import { createManualAddress, getAllManualAddresses, getManualAddressByCode, updateManualAddress, deactivateManualAddress } from '../controllers/manuladdress.js';

const router = express.Router();
router.post('/createManualAddress', createManualAddress)
router.get('/getAllManualAddresses', getAllManualAddresses)
router.get("/:code", getManualAddressByCode);
router.put("/:code", updateManualAddress);
router.patch("/:code/deactivate", deactivateManualAddress);

export default router;