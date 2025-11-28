// models/ChunkUpload.js
import mongoose from "mongoose";

const ChunkUploadSchema = new mongoose.Schema({
    fileId: { type: String, required: true, index: true },
    chunkNumber: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    size: { type: Number, required: true }, // size of this chunk in bytes
    buffer: { type: Buffer, required: true }, // store chunk binary safely (optional: use GridFS for very large scale)
    uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// unique per fileId + chunkNumber
ChunkUploadSchema.index({ fileId: 1, chunkNumber: 1 }, { unique: true });

export default mongoose.model("ChunkUpload", ChunkUploadSchema);
