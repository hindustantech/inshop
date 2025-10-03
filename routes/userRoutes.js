import express from "express";
import {fetchUsers } from "../controllers/getUser.js";
const router = express.Router();

router.get("/fetchUsers", fetchUsers);


export default router;
