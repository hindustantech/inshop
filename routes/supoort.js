import express from "express";

import {
    createMessage,
    getMessages,
    getMessagesByUser,
    deleteMessage,
} from "../controllers/Support.js";
import authMiddleware from "../middlewares/authMiddleware.js";
const router = express.Router();

router.post("/", authMiddleware, createMessage);
router.get("/", authMiddleware, getMessages);
router.get("/user/:userId", authMiddleware, getMessagesByUser);
router.delete("/:messageId", authMiddleware, deleteMessage);

export default router;
