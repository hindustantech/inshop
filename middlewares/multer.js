// middleware/multer.js
import multer from "multer";

// For chunk upload: the client will send chunk as field 'chunk'
export const chunkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // optional per-chunk size limit (10MB)
});

// For regular single-file endpoints (bannerImage)
export const singleFileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // adjust limit as needed
}).single('bannerImage');
