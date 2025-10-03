import express from "express";
import {fetchUsers } from "../controllers/getUser.js";
const router = express.Router();

// 📌 GET /api/users/partners?page=1&limit=10&search=john&filterKey=city&filterValue=Mumbai
router.get("/fetchUsers", fetchUsers);


export default router;
