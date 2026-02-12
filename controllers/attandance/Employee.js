import User from "../../models/userModel.js";
import Employee from "../../models/Attandance/Employee.js";
import Attendance from "../../models/Attandance/Attendance.js";
import Holiday from "../../models/Attandance/Holiday.js";
import Payroll from "../../models/Attandance/Payroll.js";
import mongoose from "mongoose";

/* ---------------------------------------------
   Utility: Generate Unique Employee Code
---------------------------------------------- */
const generateEmpCode = async (companyId) => {
    const count = await Employee.countDocuments({ companyId });

    return `EMP-${companyId.toString().slice(-4)}-${count + 1}-${Date.now()}`;
};

/* ---------------------------------------------
   CREATE EMPLOYEE (ENTERPRISE LEVEL)
---------------------------------------------- */
export const createEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        /* ---------------------------------------------
           1. Authorization
        ---------------------------------------------- */
        const companyId = req.user?._id || req.user?.id;
        const userRole = req.user?.role || req.user?.type;

        if (!companyId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        if (!['partner', 'admin', 'super_admin'].includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        /* ---------------------------------------------
           2. Validation
        ---------------------------------------------- */
        const {
            userId,
            role,
            jobInfo,
            salaryStructure,
            bankDetails,
            officeLocation,
        } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required",
            });
        }

        /* ---------------------------------------------
           3. Check User Exists
        ---------------------------------------------- */
        const user = await User.findById(userId).session(session);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        /* ---------------------------------------------
           4. Prevent Duplicate Employee
        ---------------------------------------------- */
        const alreadyExists = await Employee.findOne({
            companyId,
            userId,
        }).session(session);

        if (alreadyExists) {
            return res.status(409).json({
                success: false,
                message: "Employee already exists",
            });
        }

        /* ---------------------------------------------
           5. Generate Employee Code
        ---------------------------------------------- */
        const empCode = await generateEmpCode(companyId);

        /* ---------------------------------------------
           6. Build Employee Object
        ---------------------------------------------- */
        const employeePayload = {
            companyId,
            userId,
            empCode,

            role: role || "employee",

            jobInfo: {
                designation: jobInfo?.designation,
                department: jobInfo?.department,
                joiningDate: jobInfo?.joiningDate || new Date(),
                reportingManager: jobInfo?.reportingManager,
            },

            salaryStructure: {
                basic: salaryStructure?.basic || 0,
                hra: salaryStructure?.hra || 0,
                da: salaryStructure?.da || 0,
                bonus: salaryStructure?.bonus || 0,
                perDay: salaryStructure?.perDay || 0,
                perHour: salaryStructure?.perHour || 0,
                overtimeRate: salaryStructure?.overtimeRate || 0,
            },

            bankDetails: {
                accountNo: bankDetails?.accountNo,
                ifsc: bankDetails?.ifsc,
                bankName: bankDetails?.bankName,
            },

            officeLocation: officeLocation
                ? {
                    type: "Point",
                    coordinates: officeLocation.coordinates,
                    radius: officeLocation.radius || 100,
                }
                : undefined,

            employmentStatus: "active",
        };

        /* ---------------------------------------------
           7. Save Employee
        ---------------------------------------------- */
        const employee = await Employee.create(
            [employeePayload],
            { session }
        );

        /* ---------------------------------------------
           8. Commit Transaction
        ---------------------------------------------- */
        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            success: true,
            message: "Employee created successfully",
            data: employee[0],
        });
    } catch (error) {
        /* ---------------------------------------------
           Rollback
        ---------------------------------------------- */
        await session.abortTransaction();
        session.endSession();

        console.error("CreateEmployee Error:", error);

        /* ---------------------------------------------
           Duplicate Key Handling
        ---------------------------------------------- */
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Duplicate employee detected",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
};


export const findbyPhone = async (req, res) => {
    const { phone } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }

        return res.status(200).json({
            success: true,
            message: "Employee found",
            data: user
        })
    } catch (error) {
        console.error("FindByPhone Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
}

export const findbyReferralCode = async (req, res) => {
    const { referalCode } = req.body;
    try {

        const user = await User.findOne({ referalCode });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }

        return res.status(200).json({
            success: true,
            message: "Employee found",
            data: user
        })
    }
    catch (error) {
        console.error("FindByReferralCode Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
}



/* --------------------------------------------------
   GET ALL EMPLOYEES WITH PAGINATION
--------------------------------------------------- */
export const getAllEmployees = async (req, res) => {
    try {
        /* ---------------------------------------------
           1. Auth Validation
        ---------------------------------------------- */
        const companyId = req.user?._id;

        if (!companyId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        /* ---------------------------------------------
           2. Read Query Params
        ---------------------------------------------- */
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit) || 10, 100); // max 100

        const skip = (page - 1) * limit;

        /* ---------------------------------------------
           3. Optional Filters (Scalable)
        ---------------------------------------------- */
        const {
            role,
            department,
            status,
            search,
        } = req.query;

        const filter = {
            companyId,
        };

        if (role) filter.role = role;

        if (status) filter.employmentStatus = status;

        if (department) {
            filter["jobInfo.department"] = department;
        }

        if (search) {
            filter.$or = [
                { empCode: { $regex: search, $options: "i" } },
            ];
        }

        /* ---------------------------------------------
           4. Execute Queries in Parallel
        ---------------------------------------------- */
        const [employees, total] = await Promise.all([

            Employee.find(filter)
                .populate("userId", "name email phone")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            Employee.countDocuments(filter)

        ]);

        /* ---------------------------------------------
           5. Pagination Meta
        ---------------------------------------------- */
        const totalPages = Math.ceil(total / limit);

        /* ---------------------------------------------
           6. Response
        ---------------------------------------------- */
        return res.status(200).json({
            success: true,
            message: "Employees fetched successfully",

            meta: {
                totalRecords: total,
                totalPages,
                currentPage: page,
                pageSize: limit,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },

            data: employees,
        });

    } catch (error) {

        console.error("getAllEmployees Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
};

export const getEmpDetails = async (req, res) => {
    const { empId } = req.params;
    try {
        const employee = await Employee.findById(empId).populate("userId", "name email phone");
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            })
        }
        return res.status(200).json({
            success: true,
            message: "Employee details fetched successfully",
            data: employee
        })
    } catch (error) {
        console.error("getEmpDetails Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
}

export const getEmpByUserId = async (req, res) => {
    const userId = req.user?._id;
    try {
        const employee = await Employee.findOne({ userId }).populate("userId", "name email phone");
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            })
        }
        return res.status(200).json({
            success: true,
            message: "Employee details fetched successfully",
            data: employee
        })
    } catch (error) {
        console.error("getEmpByUserId Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
}


export const checkEmpButton = async (req, res) => {
    const userId = req.user?._id;
    try {
        const employee = await Employee.findOne({ userId, employmentStatus: "active" });
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            })
        }
        return res.status(200).json({
            success: true,
            message: "Employee found",
            data: {
                showButton: true
            }
        })
    }
    catch (error) {
        console.error("checkEmpButton Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
}

export  const delteEmployee = async (req, res) => {
    const { empId } = req.params;
    try {
        const employee = await Employee.findByIdAndDelete(empId);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            })
        }
        return res.status(200).json({
            success: true,
            message: "Employee deleted successfully",
            data: employee
        })
    }
    catch (error) {
        console.error("deleteEmployee Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
}

