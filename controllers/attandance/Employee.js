import User from "../../models/userModel.js";
import Employee from "../../models/Attandance/Employee.js";
import Attendance from "../../models/Attandance/Attendance.js";
import Holiday from "../../models/Attandance/Holiday.js";
import Payroll from "../../models/Attandance/Payroll.js";
import mongoose from "mongoose";
import PatnerProfile from "../../models/PatnerProfile.js";



// controllers/companyController.js

export const getCompanyByUser = async (req, res) => {
    try {
        const { userType } = req.params; // or from req.body
        const userId = req.user?._id || req.user?.id;

        // Validate input
        if (!userId || !userType) {
            return res.status(400).json({
                success: false,
                message: 'userId and userType are required'
            });
        }

        let companyDetails = null;

        // CASE 1: User is PARTNER - directly get their company profile
        if (userType === 'partner' || userType === 'admin' || userType === 'super_admin') {
            const partnerProfile = await PatnerProfile.findOne({ User_id: userId })
                .select('firm_name logo email address isIndependent')
                .populate('User_id', 'name email')
                .lean();

            if (partnerProfile) {
                companyDetails = {
                    companyId: partnerProfile._id,
                    companyName: partnerProfile.firm_name,
                    companyLogo: partnerProfile.logo,
                    email: partnerProfile.email,
                    address: partnerProfile.address || { city: '', state: '' },
                    isIndependent: partnerProfile.isIndependent,
                    adminName: partnerProfile.User_id?.name,
                    userType: 'partner'
                };
            }
        }

        // CASE 2: User is EMPLOYEE - find company they're associated with
        else if (userType === 'user') {
            const employee = await Employee.findOne({ userId: userId })
                .populate({
                    path: 'companyId',
                    select: 'name email' // Get admin user info
                })
                .lean();

            if (employee && employee.companyId) {
                // Get company details from partner profile
                const partnerProfile = await PatnerProfile.findOne({
                    User_id: employee.companyId._id
                })
                    .select('firm_name logo email address isIndependent')
                    .lean();

                if (partnerProfile) {
                    companyDetails = {
                        companyId: partnerProfile._id,
                        companyName: partnerProfile.firm_name,
                        companyLogo: partnerProfile.logo,
                        email: partnerProfile.email,
                        address: partnerProfile.address || { city: '', state: '' },
                        isIndependent: partnerProfile.isIndependent,
                        employeeInfo: {
                            empCode: employee.empCode,
                            designation: employee.jobInfo?.designation,
                            department: employee.jobInfo?.department
                        },
                        userType: 'employee'
                    };
                }
            }
        }

        // If no company found
        if (!companyDetails) {
            return res.status(404).json({
                success: false,
                message: `No company found for this ${userType}`
            });
        }

        // Return success response
        return res.status(200).json({
            success: true,
            data: companyDetails
        });

    } catch (error) {
        console.error('Error in getCompanyByUser:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};


/* ---------------------------------------------
   CREATE EMPLOYEE (ENTERPRISE LEVEL)
---------------------------------------------- */
export const createEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        /* ---------------------------------------------
           1. Auth & Role Validation
        ---------------------------------------------- */
        const companyId = req.user?._id || req.user?.id;
        const role = req.user?.role || req.user?.type;

        if (!companyId) throw new Error("Unauthorized");

        const allowedRoles = ["partner", "admin", "super_admin"];
        if (!allowedRoles.includes(role)) {
            throw new Error("Access denied");
        }

        /* ---------------------------------------------
           2. Input Validation
        ---------------------------------------------- */
        const {
            userId,
            shift,
            empCode,
            user_name,
            jobInfo,
            weeklyOff,
            salaryStructure,
            bankDetails,
            officeLocation
        } = req.body;

        if (!userId) throw new Error("userId is required");

        /* ---------------------------------------------
           3. Dependency Validation
        ---------------------------------------------- */
        const user = await User.findById(userId).session(session);
        if (!user) throw new Error("User not found");

        if (shift) {
            const shiftExists = await Shift.findById(shift).session(session);
            if (!shiftExists) throw new Error("Shift not found");
        }

        /* ---------------------------------------------
           4. Duplicate Employee Check
        ---------------------------------------------- */
        const existingEmployee = await Employee.findOne({
            companyId,
            userId
        }).session(session);

        if (existingEmployee) {
            throw new Error("Employee already exists");
        }

        /* ---------------------------------------------
           5. Subscription Validation (USING FEATURE SERVICE)
        ---------------------------------------------- */
        const subscription = await getActiveSubscription(companyId, session);

        // Use the feature service to validate subscription
        const subscriptionStatus = validateSubscription(subscription);
        if (!subscriptionStatus.valid) {
            throw new Error(subscriptionStatus.message);
        }

        // Check if can create employee using the service
        const canCreate = canCreateEmployee(subscription);
        if (!canCreate) {
            const remaining = getRemainingEmployeeSlots(subscription);
            if (remaining === 0) {
                throw new Error("Employee limit reached. Please upgrade your plan to add more employees.");
            }
            throw new Error("Cannot create employee due to subscription restrictions");
        }

        // Get real-time employee count (additional safety check)
        const currentCount = await Employee.countDocuments({
            companyId,
            employmentStatus: "active"
        }).session(session);

        const employeeLimit = getEmployeeLimit(subscription);

        if (currentCount >= employeeLimit) {
            throw new Error(`Employee limit of ${employeeLimit} reached. Please upgrade your plan.`);
        }

        // Check if nearing limit for warning (optional)
        const nearingLimit = isNearingEmployeeLimit(subscription, 80);
        if (nearingLimit) {
            // You can add a warning header or log this
            console.warn(`Company ${companyId} is nearing employee limit: ${currentCount}/${employeeLimit}`);
        }

        /* ---------------------------------------------
           6. Create Employee
        ---------------------------------------------- */
        const employeeData = {
            userId,
            companyId,
            empCode,
            user_name,
            jobInfo,
            shift,
            weeklyOff,
            salaryStructure,
            bankDetails,
            officeLocation,
            employmentStatus: "active"
        };

        const [employee] = await Employee.create([employeeData], { session });

        /* ---------------------------------------------
           7. Update Usage Tracking
        ---------------------------------------------- */
        // Use direct update instead of subscription.save()
        await Subscription.updateOne(
            { _id: subscription._id },
            { $inc: { 'usage.employeesUsed': 1 } },
            { session }
        );

        // Update local subscription object for response
        subscription.usage.employeesUsed = (subscription.usage?.employeesUsed || 0) + 1;

        /* ---------------------------------------------
           8. Commit Transaction
        ---------------------------------------------- */
        await session.commitTransaction();

        // Prepare response with subscription info
        const response = {
            success: true,
            message: "Employee created successfully",
            data: employee,
            subscription: {
                employeesUsed: subscription.usage?.employeesUsed || 0,
                employeeLimit: getEmployeeLimit(subscription),
                remainingSlots: getRemainingEmployeeSlots(subscription),
                nearingLimit: isNearingEmployeeLimit(subscription, 80)
            }
        };

        // Add warning if nearing limit
        if (isNearingEmployeeLimit(subscription, 80)) {
            response.warning = `You have used ${subscription.usage?.employeesUsed || 0} out of ${getEmployeeLimit(subscription)} employee slots. Consider upgrading your plan.`;
        }

        return res.status(201).json(response);

    } catch (error) {
        // Only abort transaction if session is still active and transaction is in progress
        if (session && session.inTransaction()) {
            await session.abortTransaction();
        }

        // Handle specific error cases
        let statusCode = 400;
        let errorResponse = {
            success: false,
            message: error.message
        };

        if (error.message.includes("limit reached")) {
            statusCode = 403;
            errorResponse.code = "EMPLOYEE_LIMIT_REACHED";
        } else if (error.message.includes("subscription")) {
            statusCode = 403;
            errorResponse.code = "SUBSCRIPTION_ERROR";
        } else if (error.message.includes("Unauthorized") || error.message.includes("Access denied")) {
            statusCode = 401;
            errorResponse.code = "UNAUTHORIZED";
        } else if (error.message.includes("not found")) {
            statusCode = 404;
            errorResponse.code = "NOT_FOUND";
        }

        return res.status(statusCode).json(errorResponse);
    } finally {
        // Always end the session
        if (session) {
            session.endSession();
        }
    }
};


/* ---------------------------------------------
   Update EMPLOYEE (ENTERPRISE LEVEL)
---------------------------------------------- */

export const updateEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        /* ---------------------------------------------
           1. Authorization (Multi-Tenant Security)
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
           2. Params Validation
        ---------------------------------------------- */
        const { employeeId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employeeId",
            });
        }

        const existingEmployee = await Employee.findOne({
            _id: employeeId,
            companyId
        }).session(session);

        if (!existingEmployee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found",
            });
        }

        /* ---------------------------------------------
           3. Build Safe Update Payload (Field Whitelisting)
        ---------------------------------------------- */
        const {
            user_name,
            role,
            jobInfo,
            salaryStructure,
            bankDetails,
            officeLocation,
            employmentStatus
        } = req.body;

        const updatePayload = {};

        if (user_name !== undefined) updatePayload.user_name = user_name;

        if (role && ['employee', 'manager', 'hr', 'admin', 'super_admin'].includes(role)) {
            updatePayload.role = role;
        }

        /* -------- Job Info -------- */
        if (jobInfo) {
            updatePayload.jobInfo = {
                ...existingEmployee.jobInfo.toObject(),
                ...jobInfo
            };
        }

        /* -------- Salary -------- */
        if (salaryStructure) {
            updatePayload.salaryStructure = {
                ...existingEmployee.salaryStructure.toObject(),
                ...salaryStructure
            };
        }

        /* -------- Bank -------- */
        if (bankDetails) {
            updatePayload.bankDetails = {
                ...existingEmployee.bankDetails.toObject(),
                ...bankDetails
            };
        }

        /* -------- Geo Location -------- */
        if (officeLocation?.coordinates) {
            if (!Array.isArray(officeLocation.coordinates) || officeLocation.coordinates.length !== 2) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid coordinates format",
                });
            }

            updatePayload.officeLocation = {
                type: "Point",
                coordinates: officeLocation.coordinates,
                radius: officeLocation.radius || existingEmployee.officeLocation?.radius || 100,
                manual: officeLocation.manual || existingEmployee.officeLocation?.manual || 'IND',
                locationtype: officeLocation.locationtype || existingEmployee.officeLocation?.locationtype || 'IND',
            };
        }

        if (employmentStatus) {
            updatePayload.employmentStatus = employmentStatus;
        }

        /* ---------------------------------------------
           4. Atomic Update (No Hydration = Faster)
        ---------------------------------------------- */
        const updatedEmployee = await Employee.findOneAndUpdate(
            { _id: employeeId, companyId },
            { $set: updatePayload },
            {
                new: true,
                runValidators: true,
                session
            }
        );

        /* ---------------------------------------------
           5. Commit Transaction
        ---------------------------------------------- */
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: updatedEmployee
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("UpdateEmployee Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Duplicate constraint violation",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
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
        const employee = await Employee.findById(empId);
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

export const delteEmployee = async (req, res) => {
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

