// controllers/userController.js
import User from '../models/userModel.js';
import bcrypt from 'bcryptjs'; // Assume bcryptjs is installed for password hashing
import json2csv from 'json2csv'

// Helper function for paginatiozn and filtering
const getUserQuery = (search, role, isAgency) => {
  const query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  if (role) {
    query.type = role;
  }
  if (isAgency === 'true') {
    query.type = 'agency';
  }
  return query;
};

// GET /api/users - Fetch all users with pagination, search, filters
export const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const isAgency = req.query.agency || '';

    const query = getUserQuery(search, role, isAgency);

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -otp') // Exclude sensitive fields
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      message: 'Users fetched successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: error.message
    });
  }
};

// GET /api/users/export - Export users to CSV
export const exportUsers = async (req, res) => {
  try {
    const search = req.query.search || '';
    const role = req.query.role || '';
    const isAgency = req.query.agency || '';

    const query = getUserQuery(search, role, isAgency);

    const users = await User.find(query)
      .select('-password -otp') // Exclude sensitive fields
      .lean();

    // Prepare data for CSV, excluding sensitive fields
    const csvData = users.map(user => ({
      UID: user.uid,
      Name: user.name,
      Email: user.email,
      Phone: user.phone,
      Type: user.type,
      IsVerified: user.isVerified,
      Suspended: user.suspend,
      ReferralCode: user.referalCode,
      CreatedAt: user.createdAt
    }));

    let csv;
    try {
      csv = json2csv.parse(csvData);
    } catch (err) {
      // Fallback manual CSV generation if library fails
      const headers = Object.keys(csvData[0]).join(',');
      const rows = csvData.map(row => Object.values(row).join(',')).join('\n');
      csv = `${headers}\n${rows}`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: error.message
    });
  }
};

// GET /api/users/analytics - User analytics
export const getUserAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Use aggregation for efficient counting
    const [totalUsers, activeUsers, newThisMonth, blockedUsers] = await Promise.all([
      User.countDocuments({}), // Total users
      User.countDocuments({ isVerified: true, suspend: false }), // Active: verified and not suspended
      User.countDocuments({ createdAt: { $gte: startOfMonth } }), // New this month
      User.countDocuments({ suspend: true }) // Blocked: suspended
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        newThisMonth,
        blockedUsers
      },
      message: 'Analytics fetched successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: error.message
    });
  }
};

// GET /api/users/:id - View user profile
export const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password -otp') // Exclude sensitive fields
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user,
      message: 'Profile fetched successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: error.message
    });
  }
};

// PUT /api/users/:id/role - Change user role
export const changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body; // Expected: 'user', 'partner', 'agency', 'super_admin'

    if (!['user', 'partner', 'agency', 'super_admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid role'
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { type: role },
      { new: true, runValidators: true }
    ).select('-password -otp');

    if (!user) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user,
      message: 'Role updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: error.message
    });
  }
};

// PUT /api/users/:id/block - Block/unblock user (toggle suspend)
export const toggleUserBlock = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('suspend');
    if (!user) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'User not found'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { suspend: !user.suspend },
      { new: true }
    ).select('-password -otp');

    const action = updatedUser.suspend ? 'blocked' : 'unblocked';

    res.status(200).json({
      success: true,
      data: updatedUser,
      message: `User ${action} successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: error.message
    });
  }
};

// POST /api/users - Add new user
export const createUser = async (req, res) => {
  try {
    const { name, email, password, phone, type = 'user' } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Name, email, and password are required'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      type
      // Other fields will be handled by schema defaults/pre-save
    });

    const savedUser = await newUser.save();

    // Exclude sensitive fields in response
    const { password: _, otp: __, ...userResponse } = savedUser.toObject();

    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'User created successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Email or phone already exists'
      });
    }
    res.status(500).json({
      success: false,
      data: null,
      message: error.message
    });
  }
};