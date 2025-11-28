import express from "express";
import { uploadChunk,checkUploadStatus,mergeChunks } from "../controllers/uploadController.js";
import { chunkUpload } from "../middlewares/multer.js";
import authMiddleware from "../middlewares/authMiddleware.js";
const router = express.Router();

// Upload a chunk: POST /upload/chunk
// fields: fileId, chunkNumber, totalChunks, ownerId, fileType, fileName
router.post("/chunk", authMiddleware, chunkUpload.single("chunk"), uploadChunk);

// Check status: GET /upload/status/:fileId
router.get("/status/:fileId", authMiddleware, checkUploadStatus);

// Merge chunks and upload to Cloudinary: POST /upload/merge
router.post("/merge", authMiddleware, mergeChunks);

export default router;
