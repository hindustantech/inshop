import express from 'express';
// import getGeneralInfo from "../controllers/generalController.js";
import { getGeneralInfo } from "../controllers/generalController.js";
const router = express.Router();

// Test route

router.get("/", getGeneralInfo);

export default router;