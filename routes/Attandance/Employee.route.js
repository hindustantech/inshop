import express from "express";

/* ===============================
   Controllers
================================ */

import {
    createEmployee,
    findbyPhone,
    getAllEmployees,
    getEmpDetails,
    getEmpByUserId
} from "../../controllers/Attandance/Employee.js";

/* ===============================
   Middlewares
================================ */
import authMiddleware from "../../middlewares/authMiddleware.js";

/* ===============================
   Router Init
================================ */

const router = express.Router();

/* ===============================
   ADMIN / HR ROUTES
================================ */

/**
 * Create Employee
 * POST /api/employees
 * Only: Admin / Partner / Super Admin
 */
router.post(
    "/",
    authMiddleware,
    createEmployee
);

/**
 * Find User By Phone (Before Creating Employee)
 * POST /api/employees/find-by-phone
 */
router.post(
    "/find-by-phone",
    authMiddleware,
    findbyPhone
);

/**
 * Get All Employees (Paginated)
 * GET /api/employees
 */
router.get(
    "/",
    authMiddleware,
    getAllEmployees
);

/**
 * Get Employee Details By Employee ID
 * GET /api/employees/:empId
 */
router.get(
    "/:empId",
    authMiddleware,
    getEmpDetails
);

/* ===============================
   EMPLOYEE ROUTES
================================ */

/**
 * Get Own Employee Profile
 * GET /api/employees/me
 */
router.get(
    "/me/profile",
    authMiddleware,
    getEmpByUserId
);

export default router;
