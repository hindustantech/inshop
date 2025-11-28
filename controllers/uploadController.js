// controllers/uploadController.js
import mongoose from "mongoose";
import ChunkUpload from "../models/ChunkUpload.js";
import FileUpload from "../models/FileUpload.js";
import fs from "fs/promises"; // for optional temporary local writes (not used here)
import PromotionalBanner from "../models/PromotionalBanner.js";
import { uploadToCloudinary } from "../utils/Cloudinary.js";

// Helper - get uploaded chunk count for fileId
const countUploadedChunks = async (fileId) => {
    return await ChunkUpload.countDocuments({ fileId });
};

// Upload a single chunk
export const uploadChunk = async (req, res) => {
    try {
        const { fileId, chunkNumber, totalChunks, ownerId, fileType, fileName } = req.body;

        if (!fileId || !chunkNumber || !totalChunks || !ownerId) {
            return res.status(400).json({ success: false, message: "Missing required fields (fileId, chunkNumber, totalChunks, ownerId)" });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: "Chunk file is required as file buffer" });
        }

        const chunkNum = parseInt(chunkNumber, 10);
        const total = parseInt(totalChunks, 10);

        // Create or update file master record if not exists
        let fileRecord = await FileUpload.findOne({ fileId });
        if (!fileRecord) {
            fileRecord = new FileUpload({
                fileId,
                ownerId,
                fileType: fileType || "image",
                fileName: fileName || fileId,
                totalChunks: total,
                uploadedChunks: 0,
                status: "pending"
            });
            await fileRecord.save();
        }

        // Save chunk into DB (unique index prevents duplicates)
        const chunkDoc = new ChunkUpload({
            fileId,
            chunkNumber: chunkNum,
            totalChunks: total,
            size: req.file.size || req.file.buffer.length,
            buffer: req.file.buffer
        });

        await chunkDoc.save();

        // Increment uploadedChunks atomically (only if not previously present)
        const uploadedCount = await countUploadedChunks(fileId);
        fileRecord.uploadedChunks = uploadedCount;
        await fileRecord.save();

        // If all chunks uploaded, signal client to call /merge or auto-merge here
        const allUploaded = uploadedCount === total;

        return res.status(200).json({
            success: true,
            message: `Chunk ${chunkNum} uploaded`,
            fileId,
            uploadedChunks: uploadedCount,
            allUploaded
        });

    } catch (error) {
        // Duplicate chunk error handling
        if (error.code === 11000) {
            return res.status(200).json({ success: true, message: "Chunk already uploaded (duplicate ignored)" });
        }
        console.error("uploadChunk error:", error);
        return res.status(500).json({ success: false, message: "Chunk upload failed", error: error.message });
    }
};

// Check status of upload (which chunks present)
export const checkUploadStatus = async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!fileId) return res.status(400).json({ success: false, message: "Missing fileId" });

        const fileRecord = await FileUpload.findOne({ fileId });
        if (!fileRecord) return res.status(404).json({ success: false, message: "File not found" });

        const chunks = await ChunkUpload.find({ fileId }).select("chunkNumber size uploadedAt -_id").sort({ chunkNumber: 1 });

        return res.status(200).json({
            success: true,
            fileId,
            totalChunks: fileRecord.totalChunks,
            uploadedChunks: fileRecord.uploadedChunks,
            chunks,
            status: fileRecord.status,
            finalFileUrl: fileRecord.finalFileUrl
        });

    } catch (error) {
        console.error("checkUploadStatus error:", error);
        return res.status(500).json({ success: false, message: "Failed to check upload status", error: error.message });
    }
};

// Merge chunks -> create final buffer -> upload to Cloudinary -> update FileUpload -> cleanup chunks
export const mergeChunks = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { fileId } = req.body;
        if (!fileId) return res.status(400).json({ success: false, message: "Missing fileId" });

        // start a transaction for safety
        session.startTransaction();

        const fileRecord = await FileUpload.findOne({ fileId }).session(session);
        if (!fileRecord) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "File record not found" });
        }

        if (fileRecord.status === "completed") {
            await session.commitTransaction();
            return res.status(200).json({ success: true, message: "Already merged", finalFileUrl: fileRecord.finalFileUrl });
        }

        const total = fileRecord.totalChunks;

        // Get all chunks sorted by chunkNumber
        const chunks = await ChunkUpload.find({ fileId }).sort({ chunkNumber: 1 }).session(session);

        if (!chunks || chunks.length !== total) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: `Missing chunks: expected ${total}, got ${chunks.length}` });
        }

        // Optional basic validation: ensure sequence 1..total present
        for (let i = 0; i < chunks.length; i++) {
            const expected = i + 1;
            if (chunks[i].chunkNumber !== expected) {
                await session.abortTransaction();
                return res.status(400).json({ success: false, message: `Chunk order mismatch at position ${i}. expected ${expected}, got ${chunks[i].chunkNumber}` });
            }
        }

        // Assemble final Buffer by concatenation
        // Calculate final size first (optional)
        let finalSize = 0;
        for (const c of chunks) finalSize += c.size;

        const buffers = chunks.map(c => c.buffer);
        const finalBuffer = Buffer.concat(buffers, finalSize);

        // Mark processing
        fileRecord.status = "processing";
        await fileRecord.save({ session });

        // Upload to Cloudinary - resource_type 'auto' will detect image/video
        let uploaded;
        try {
            uploaded = await uploadToCloudinary(finalBuffer, "banners");
        } catch (uplErr) {
            fileRecord.status = "failed";
            fileRecord.errorMessage = uplErr.message || "Cloudinary upload failed";
            await fileRecord.save({ session });
            await session.commitTransaction();
            console.error("Cloudinary upload failed:", uplErr);
            return res.status(500).json({ success: false, message: "Failed to upload merged file", error: uplErr.message });
        }

        // Update fileRecord
        fileRecord.finalFileUrl = uploaded.secure_url || uploaded.url || uploaded;
        fileRecord.status = "completed";
        await fileRecord.save({ session });

        // Commit before cleaning (so final URL is safe)
        await session.commitTransaction();

        // Cleanup chunks - remove docs (non-transactional)
        try {
            await ChunkUpload.deleteMany({ fileId });
        } catch (cleanupErr) {
            console.warn("Failed to cleanup chunk docs for fileId", fileId, cleanupErr);
        }

        return res.status(200).json({
            success: true,
            message: "File merged and uploaded successfully",
            finalFileUrl: fileRecord.finalFileUrl
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("mergeChunks error:", error);
        return res.status(500).json({ success: false, message: "Merge failed", error: error.message });
    } finally {
        session.endSession();
    }
};
