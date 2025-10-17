// controllers/permissionController.js

import User from "../models/userModel.js";
import Permission from "../models/Permission.js";
import PermissionLog from "../models/PermissionLog.js";
/**
 * Assign permission to a user
 */
export const assignPermission = async (req, res) => {
  try {
    const { userId, permissionKey } = req.body;
    const performedBy = req.user._id; // admin performing this action

    const perm = await Permission.findOne({ key: permissionKey });
    if (!perm) return res.status(404).json({ message: 'Permission not found' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.permissions.includes(permissionKey)) {
      return res.status(400).json({ message: 'Permission already assigned' });
    }

    user.permissions.push(permissionKey);
    await user.save();

    await PermissionLog.create({ userId, permissionKey, actionType: 'ASSIGNED', performedBy });

    res.json({ success: true, message: 'Permission assigned', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Remove permission from a user
 */
export const removePermission = async (req, res) => {
  try {
    const { userId, permissionKey } = req.body;
    const performedBy = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.permissions.includes(permissionKey)) {
      return res.status(400).json({ message: 'Permission not assigned' });
    }

    user.permissions = user.permissions.filter(p => p !== permissionKey);
    await user.save();

    await PermissionLog.create({ userId, permissionKey, actionType: 'REMOVED', performedBy });

    res.json({ success: true, message: 'Permission removed', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get user permissions
 */
export const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ permissions: user.permissions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
