import express from "express";
import { generateQR, downloadQR } from "../controllers/qrController.js";

const router = express.Router();

router.post("/generate", generateQR);
router.get("/download/qr/:file", downloadQR);

export default router;
