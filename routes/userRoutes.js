import express from "express";
import { getAgencies,getPartners } from "../controllers/getUser.js";
const router = express.Router();

// 📌 GET /api/users/partners?page=1&limit=10&search=john&filterKey=city&filterValue=Mumbai
router.get("/partners", getPartners);

// 📌 GET /api/users/agencies?page=1&limit=10&search=john&filterKey=state&filterValue=Bihar
router.get("/agencies", getAgencies);

export default router;
