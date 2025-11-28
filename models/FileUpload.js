// models/FileUpload.js
import mongoose from "mongoose";

const FileUploadSchema = new mongoose.Schema({
    fileId: { type: String, required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileType: { type: String, enum: ["image", "video", "banner", "other"], required: true },
    fileName: { type: String },
    totalChunks: { type: Number, required: true },
    uploadedChunks: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
    finalFileUrl: { type: String, default: null },
    errorMessage: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// optional TTL for stale uploads: remove after e.g. 7 days
FileUploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export default mongoose.model("FileUpload", FileUploadSchema);
