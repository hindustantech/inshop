import exprees from 'express';
import { createAppSettings, deleteAppSettings, getAppSettings, updateAppSettings } from '../controllers/appsetting.js';
const router = exprees.Router();

router.get('/get', getAppSettings);
router.post('/create', createAppSettings);
router.put('/update', updateAppSettings);
router.delete('/delete', deleteAppSettings);

export default router;