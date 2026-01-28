import mongoose from "mongoose";
import CorporateRequest from "../models/corparete.js";
import User from "../models/userModel.js";
/**
 * Toggle Corporate User Flag
 * Only: admin / super_admin
 *
 * PATCH /api/admin/users/:userId/corporate
 * body: { enable: true | false }
 */
export const toggleCorporateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { enable } = req.body;

    // ---------- Validation ----------
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    if (typeof enable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "`enable` must be boolean (true/false)",
      });
    }

    // ---------- Authorization ----------
    const requester = req.user; // injected by auth middleware

    if (!["admin", "super_admin"].includes(requester.type)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // ---------- Update (atomic) ----------
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { corpareteUser: enable } },
      { new: true, runValidators: true }
    ).select("_id name email corpareteUser type");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ---------- Response ----------
    return res.status(200).json({
      success: true,
      message: `Corporate user ${enable ? "enabled" : "disabled"} successfully`,
      data: updatedUser,
    });
  } catch (error) {
    console.error("toggleCorporateUser error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, code, message) =>
  res.status(code).json({ success: false, message });

/* ================================
   1. Create Request (User)
================================ */

export const createCorporateRequest = async (req, res) => {
  try {
    const userId = req.user?._id; // from auth middleware
    const { additionalDetails } = req.body;

    if (!userId || !isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid requester");
    }

    // Prevent duplicate pending request
    const existing = await CorporateRequest.findOne({
      requesterId: userId,
      status: "pending"
    });

    if (existing) {
      return sendError(res, 409, "Pending request already exists");
    }

    const request = await CorporateRequest.create({
      requesterId: userId,
      additionalDetails
    });

    res.status(201).json({
      success: true,
      data: request
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to create corporate request",
      error: err.message
    });
  }
};

/* ================================
   2. Accept / Reject (Admin)
================================ */

export const updateCorporateRequestStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const admin = req.user;
    const { requestId } = req.params;
    const { status } = req.body; // accepted | rejected

    if (!admin || admin.role !== "admin") {
      return sendError(res, 403, "Admin access required");
    }

    if (!isValidObjectId(requestId)) {
      return sendError(res, 400, "Invalid request ID");
    }

    if (!["accepted", "rejected"].includes(status)) {
      return sendError(res, 400, "Invalid status value");
    }

    const request = await CorporateRequest.findById(requestId).session(session);

    if (!request) {
      return sendError(res, 404, "Request not found");
    }

    if (request.status !== "pending") {
      return sendError(res, 409, "Request already processed");
    }

    request.status = status;
    request.acceptedAt = status === "accepted" ? new Date() : null;

    await request.save({ session });

    // Place for side-effects:
    // - upgrade user role
    // - send email
    // - push notification
    // - audit log

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Request ${status} successfully`,
      data: request
    });

  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: "Failed to update request status",
      error: err.message
    });
  } finally {
    session.endSession();
  }
};

/* ================================
   3. Get Single Request (Admin/User)
================================ */

export const getCorporateRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    if (!isValidObjectId(requestId)) {
      return sendError(res, 400, "Invalid request ID");
    }

    const request = await CorporateRequest.findById(requestId)
      .populate("requesterId", "name email role");

    if (!request) {
      return sendError(res, 404, "Request not found");
    }

    res.status(200).json({
      success: true,
      data: request
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch request",
      error: err.message
    });
  }
};

/* ================================
   4. Get All Requests (Admin)
   Pagination + Filters
================================ */

export const getAllCorporateRequests = async (req, res) => {
  try {
    const admin = req.user;

    if (!admin || admin.role !== "admin") {
      return sendError(res, 403, "Admin access required");
    }

    const {
      page = 1,
      limit = 20,
      status,
      fromDate,
      toDate
    } = req.query;

    const filter = {};

    if (status) filter.status = status;

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      CorporateRequest.find(filter)
        .populate("requesterId", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      CorporateRequest.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      },
      data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch requests",
      error: err.message
    });
  }
};

/* ================================
   5. Get Requests by User
================================ */

export const getMyCorporateRequests = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId || !isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid user");
    }

    const requests = await CorporateRequest.find({
      requesterId: userId
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: requests
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user requests",
      error: err.message
    });
  }
};
