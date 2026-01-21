import bcrypt from 'bcryptjs';
import User from '../models/userModel.js';
import { generateToken } from '../config/jwt.js';
import { sendWhatsAppOtp, verifyWhatsAppOtp } from '../utils/whatapp.js';
import { generateReferralCode } from '../utils/Referalcode.js';
import fs from 'fs';
import path from 'path';
import { uploadToCloudinary } from '../utils/Cloudinary.js';
import admin from '../utils/firebaseadmin.js';
import notification from '../models/notification.js';
import ReferralUsage from '../models/ReferralUsage.js'
import mongoose from "mongoose";
import logger from '../utils/logger.js';


// Controller function to get user IDs and names by referral codes
// Controller
export const getUserIdsAndNamesByReferralCodesController = async (req, res) => {
  try {
    const { referralCodes } = req.query; // use query params for GET

    if (!referralCodes) {
      return res.status(400).json({ success: false, message: 'No referral codes provided' });
    }

    // Ensure it's an array
    // If only one code is sent, it will be a string
    const codesArray = Array.isArray(referralCodes) ? referralCodes : referralCodes.split(',');

    // Query users with the given referral codes
    const users = await User.find({ referalCode: { $in: codesArray } }, '_id name referalCode');

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: 'No users found for these referral codes' });
    }

    // Map referral codes to user info
    const result = users.map(user => ({
      userId: user._id.toString(),
      name: user.name,
      referralCode: user.referalCode
    }));

    res.status(200).json({ success: true, users: result });

  } catch (error) {

    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    /* ===============================
       1. Authentication Check
    =============================== */
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    /* ===============================
       2. Authorization (Super Admin)
    =============================== */
    if (req.user.type !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only."
      });
    }

    /* ===============================
       3. Validate Target User ID
    =============================== */
    const { targetUserId } = req.body;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id"
      });
    }

    /* ===============================
       4. Prevent Self Deletion
    =============================== */
    if (req.user.id === targetUserId) {
      return res.status(400).json({
        success: false,
        message: "Super admin cannot delete self"
      });
    }

    /* ===============================
       5. Fetch Target User
    =============================== */
    const user = await User.findOne({
      _id: targetUserId,
      isDeleted: false
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    /* ===============================
       6. Block Deleting Other Super Admins
    =============================== */
    if (user.role === "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete another super admin"
      });
    }

    /* ===============================
       7. Soft Delete
    =============================== */
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    /* ===============================
       8. Audit Logging (optional)
    =============================== */
    // AuditLog.create({
    //   action: "DELETE_USER",
    //   performedBy: req.user.id,
    //   targetUser: targetUserId
    // });

    return res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });

  } catch (error) {
    console.error("DELETE_USER_ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    /* -------------------- AUTH VALIDATION -------------------- */
    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user context missing",
      });
    }


    const userId = req.user.id || req.user._id;
    console.log("userId", userId)
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    /* -------------------- DB QUERY -------------------- */
    const user = await User.findById(userId).select(
      "name email phone type permissions isVerified suspend createdAt"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.suspend) {
      return res.status(403).json({
        success: false,
        message: "Account suspended",
      });
    }

    /* -------------------- RESPONSE -------------------- */
    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        role: user.type,
        permissions: user.permissions ?? [],
        isVerified: user.isVerified,
        joinedAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("getUserProfile::ERROR", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};



export const getProfile = async (req, res) => {
  try {
    const userId = req.user?.id; // from auth middleware

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const user = await User.findById(userId)
      .select('name phone profileImage couponCount type referalCode referredBy')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {

    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const updateProfileImage = async (req, res) => {
  try {
    const userId = req.user?.id; // from auth middleware
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: "No image file uploaded" });
    }

    // Upload image to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, 'profile_images');

    // Update user's profileImage
    const user = await User.findByIdAndUpdate(
      userId,
      { profileImage: result.secure_url },
      { new: true, select: 'name phone profileImage couponCount type referalCode referredBy' }
    ).lean();

    res.status(200).json({ success: true, message: "Profile image updated", data: user });
  } catch (error) {

    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const broadcastNotification = async (req, res) => {

  const userId = req.user?.id; // from auth middleware
  const startTime = Date.now();
  let processedCount = 0;

  try {
    // Input validation
    const { address, title, body, data = {}, delay = 50, concurrency = 5, type = 'location' } = req.body;

    if (!address || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Address, title, and body are required fields',
      });
    }

    // Validate input types
    if (typeof title !== 'string' || typeof body !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Title and body must be strings',
      });
    }

    if (delay < 0 || !Number.isInteger(delay)) {
      return res.status(400).json({
        success: false,
        message: 'Delay must be a non-negative integer',
      });
    }

    if (concurrency < 1 || !Number.isInteger(concurrency)) {
      return res.status(400).json({
        success: false,
        message: 'Concurrency must be a positive integer',
      });
    }



    // Construct query based on address type
    const query = Array.isArray(address)
      ? {
        manul_address: { $in: address },
        devicetoken: { $exists: true, $nin: ["", null] },
      }
      : {
        manul_address: address,
        devicetoken: { $exists: true, $nin: ["", null] },
      };

    // Fetch users
    const users = await User.find(query, {
      uid: 1,
      name: 1,
      devicetoken: 1,
      manul_address: 1,
    }).lean();


    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: `No users found for address: ${Array.isArray(address) ? address.join(', ') : address}`,
      });
    }



    const results = {
      totalSuccess: 0,
      totalFailures: 0,
      invalidTokens: [],
      detailedResults: [],
    };

    // Process notifications in batches
    for (let i = 0; i < users.length; i += concurrency) {
      const batch = users.slice(i, i + concurrency);
      processedCount += batch.length;

      const batchPromises = batch.map((user) =>
        sendSingleNotification(user, title, body, data)
      );

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const notificationResult = result.value;
          results.detailedResults.push(notificationResult);

          if (notificationResult.success) {
            results.totalSuccess++;
          } else {
            results.totalFailures++;
            if (notificationResult.shouldCleanup) {
              results.invalidTokens.push({
                uid: notificationResult.user.uid,
                _id: notificationResult.user._id,
                token: notificationResult.user.devicetoken,
                error: notificationResult.error,
              });
            }
          }
        } else {
          results.totalFailures++;
          results.detailedResults.push({
            success: false,
            error: result.reason?.message || 'Unknown error in batch processing',
          });
        }
      });

      // Log progress
      const progress = ((processedCount / users.length) * 100).toFixed(1);


      // Delay between batches
      if (delay > 0 && i + concurrency < users.length) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Cleanup invalid tokens
    if (results.invalidTokens.length > 0) {
      await cleanupInvalidTokensBulk(results.invalidTokens);

    }

    // Save notification in DB
    const newNotification = await notification.create({
      title,
      message: body,
      type,
      location: type === 'location' ? address : undefined,
      users: [], // empty since this is broadcast
      createdBy: req.user?._id || null,
      createdAt: new Date(),
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    s

    return res.status(200).json({
      success: true,
      message: `Notifications sent successfully in ${duration}s`,
      data: {
        ...results,
        totalUsers: users.length,
        duration: `${duration}s`,
        successRate: `${((results.totalSuccess / users.length) * 100).toFixed(1)}%`,
        notificationId: newNotification._id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send notifications',
      error: error.message,
    });
  }
};

// Helper function for single notification
const sendSingleNotification = async (user, title, body, data) => {
  try {
    if (!user.devicetoken) {
      return {
        user,
        success: false,
        error: 'No device token found for user',
        shouldCleanup: false,
      };
    }

    const message = {
      token: user.devicetoken,
      notification: { title, body },
      data: data || {},
    };

    const response = await admin.messaging().send(message);

    return {
      user,
      success: true,
      messageId: response,
      shouldCleanup: false,
    };
  } catch (error) {
    const shouldCleanup = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument',
    ].includes(error.code);

    return {
      user,
      success: false,
      error: error.message,
      errorCode: error.code,
      shouldCleanup,
    };
  }
};

// Helper function to clean up invalid tokens
const cleanupInvalidTokensBulk = async (invalidTokens) => {
  try {
    const userIds = invalidTokens.map((token) => token._id);
    await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { devicetoken: null } }
    );
  } catch (error) {
    throw error;
  }
};


export const findUserByPhone = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const user = await User.findOne({ phone }).select("_id name");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error finding user by phone",
      error: error.message,
    });
  }
};

export const updateUserLocation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude are required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        latestLocation: {
          type: "Point",
          coordinates: [parseFloat(lng), parseFloat(lat)],
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User location updated successfully",
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating location",
      error: error.message,
    });
  }
};




export const UpdateManualAddress = async (req, res) => {
  try {
    const { manul_address } = req.body;
    const userId = req?.user?.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId, // the user to update
      { manul_address }, // update this field
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Manual address updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


const signup = async (req, res) => {
  try {
    // deviceId,
    const { name, phone, email, type, password, referralCode, deviceId
    } = req.body;


    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'Name, phone, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    if (referralCode && !/^(IND\d{3})$/.test(referralCode)) {
      return res.status(400).json({ message: 'Invalid referral code format' });
    }


    if (!["user", "partner", "agency"].includes(type)) {
      return res.status(401).json({ success: false, message: "Unauthorized Access Denied" });
    }

    // Find user by email, phone, or deviceId
    const existingUser = await User.findOne({
      $or: [
        phone ? { phone } : null,
        deviceId ? { deviceId } : null
      ].filter(Boolean)
    });

    if (email) {
      const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
      if (emailExists) {
        return res.status(400).json({
          message: 'Email already registered. Please login.'
        });
      }
    }
    if (existingUser) {
      // ✅ If device is already registered with another phone/email
      if (
        existingUser.deviceId === deviceId &&
        (existingUser.phone !== phone)
      ) {
        return res.status(400).json({
          message: 'This device is already registered with another account.'
        });
      }

      // ✅ If same user tries again (same device + same email/phone)
      if (
        existingUser.deviceId === deviceId &&
        existingUser.phone === phone
      ) {
        return res.status(200).json({
          message: 'You are already registered. Please log in instead.'
        });
      }

      // ✅ If email or phone already exists for another device

      if (existingUser.phone === phone) {
        return res.status(400).json({ message: 'Phone number is already registered.' });
      }
    }

    // Generate referral code
    let uniqueReferralCode = null;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      uniqueReferralCode = generateReferralCode();
      const existingCode = await User.findOne({ referalCode: uniqueReferralCode });
      if (!existingCode) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ message: 'Could not generate unique referral code' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      name,                              // deviceId,
      type,
      phone,
      email: email ? email.toLowerCase().trim() : undefined,
      password: hashedPassword,
      referalCode: uniqueReferralCode,
      referredBy: referralCode || null,
    });


    await newUser.save(); // SAVE FIRST

    // Send WhatsApp OTP
    const otpResponse = await sendWhatsAppOtp(phone);


    if (!otpResponse.success) {
      await User.findByIdAndDelete(newUser._id); // rollback

      return res.status(500).json({ message: 'Failed to send OTP', error: otpResponse.error });
    }

    // Store WhatsApp UID
    newUser.whatsapp_uid = otpResponse.data || null;
    await newUser.save();

    res.status(201).json({
      message: 'Signup successful, OTP sent to WhatsApp',
      userId: newUser._id,
      whatsapp_uid: newUser.whatsapp_uid
    });
  } catch (error) {
    console.log(error)
    logger.info("error", error);
    res.status(500).json({ message: 'Signup failed', error: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { userId, otp, deviceId } = req.body;

    if (!userId || !otp || !deviceId) {
      return res.status(400).json({ message: "userId, otp and deviceId are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1. Verify WhatsApp OTP
    const verifyResponse = await verifyWhatsAppOtp(user.whatsapp_uid, otp);
    if (!verifyResponse.success) {
      return res.status(400).json({ message: "Invalid OTP", error: verifyResponse.error });
    }

    // 2. Check if deviceId already belongs to another user
    const existingDeviceUser = await User.findOne({
      deviceId,
      _id: { $ne: user._id }
    }).select("_id");

    if (existingDeviceUser) {
      return res.status(409).json({
        message: "This device is already registered with another account"
      });
    }

    // 3. Atomic update (prevents race conditions)
    user.isVerified = true;
    user.deviceId = deviceId;
    user.otp = null;

    await user.save();

    // 4. Referral usage tracking
    if (user.referredBy) {
      const referrer = await User.findOne({ referalCode: user.referredBy });
      if (referrer) {
        await ReferralUsage.create({
          referralCode: user.referredBy,
          referrerId: referrer._id,
          referredUserId: user._id,
        });
      }
    }

    // 5. Token response
    res.json({
      message: "OTP verified successfully",
      token: generateToken(user._id, user.type),
      name: user.name,
      type: user.type,
      isVerified: true,
      isProfileCompleted: user.isProfileCompleted
    });

  } catch (error) {

    // Handle Mongo duplicate key error safely
    if (error.code === 11000 && error.keyPattern?.deviceId) {
      return res.status(409).json({
        message: "Device already registered with another account"
      });
    }

    res.status(500).json({
      message: "OTP verification failed",
      error: error.message
    });
  }
};




const login = async (req, res) => {
  try {
    const { phone, password, deviceId, deviceToken } = req.body;

    // ✅ 1. Basic validation for phone & password only
    if (!phone || !password) {
      return res.status(400).json({
        message: 'Phone and password are required'
      });
    }

    // ✅ 2. Find user by phone
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'Invalid phone number or password' });
    }

    // ✅ 3. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid phone number or password' });
    }

    // ✅ 4. Roles that require deviceId & deviceToken
    const requiresDevice = !['super_admin', 'admin', 'partner'].includes(user.type);

    if (requiresDevice) {
      if (!deviceId || !deviceToken) {
        return res.status(400).json({
          message: 'deviceId and deviceToken are required for your account type'
        });
      }

      // Check if deviceId already used by another user
      const deviceIdInUse = await User.findOne({
        deviceId,
        _id: { $ne: user._id }
      });
      if (deviceIdInUse) {
        return res.status(400).json({
          message: 'This device ID is already registered with another account.'
        });
      }

      // Check if deviceToken already used by another user
      const deviceTokenInUse = await User.findOne({
        deviceToken,
        _id: { $ne: user._id }
      });
      if (deviceTokenInUse) {
        return res.status(400).json({
          message: 'This device token is already registered with another account.'
        });
      }

      // Save or update deviceId & deviceToken if changed
      let updated = false;
      if (user.deviceId !== deviceId) {
        user.deviceId = deviceId;
        updated = true;
      }
      if (user.deviceToken !== deviceToken) {
        user.deviceToken = deviceToken;
        updated = true;
      }
      if (updated) await user.save();
    }

    // ✅ 5. Generate JWT token
    const token = generateToken(user._id.toString(), user.type);

    // ✅ 6. Send response
    return res.status(200).json({
      success: true,
      token,
      name: user.name,
      type: user.type,
      isApproved: user.isVerified,
      isProfileCompleted: user.isProfileCompleted,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      message: 'Login failed',
      error: error.message
    });
  }
};






const resendOtp = async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Send new WhatsApp OTP
    const otpResponse = await sendWhatsAppOtp(user.phone);
    if (!otpResponse.success) {
      return res.status(500).json({ message: 'Failed to send OTP', error: otpResponse.error });
    }

    // Update WhatsApp UID
    user.whatsapp_uid = otpResponse.data || null;
    await user.save();

    res.status(200).json({
      message: 'OTP resent successfully',
      whatsapp_uid: user.whatsapp_uid
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to resend OTP', error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Send WhatsApp OTP
    const otpResponse = await sendWhatsAppOtp(phone);
    if (!otpResponse.success) {
      return res.status(500).json({ message: 'Failed to send OTP', error: otpResponse.error });
    }

    // Store WhatsApp UID
    user.whatsapp_uid = otpResponse.data || null;
    await user.save();

    res.status(200).json({
      message: 'OTP sent to WhatsApp',
      userId: user._id,
      whatsapp_uid: user.whatsapp_uid
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send OTP', error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify WhatsApp OTP
    const verifyResponse = await verifyWhatsAppOtp(user.whatsapp_uid, otp);
    if (!verifyResponse.success) {
      return res.status(400).json({ message: 'Invalid OTP', error: verifyResponse.error });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.whatsapp_uid = null;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Password reset failed', error: error.message });
  }
};

const signout = (req, res) => {
  // Clear device token
  User.findByIdAndUpdate(req.user._id, { devicetoken: null }, { new: true })
    .then(() => {
      res.json({ message: 'Signout successful' });
    })
    .catch(error => {
      res.status(500).json({ message: 'Signout failed', error: error.message });
    });
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;



    const isDataNotEmpty = Object.keys(req.body).length > 0;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        phone: req.body.phonenumber,
        data: req.body,  // Updating the Mixed type field
        isProfileCompleted: isDataNotEmpty ? true : false,
      },
      { new: true }  // Return the updated document
    );
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(updatedUser);

  } catch (error) {

    res.status(500).json({ message: 'Server error' });
  }
};

const getProfileData = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ data: user.data, _id: userId, isApproved: user.isVerified, isProfileCompleted: user.isProfileCompleted, name: user.name, email: user.email, type: user.type });
  } catch (error) {

    res.status(500).json({ message: 'Server error' });
  }
}

const getOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const user = await User.findById(ownerId);
    if (!user || user.type !== 'partner') {
      return res.status(404).json({ message: 'Owner not found' });
    }
    res.json({ data: user.data, name: user.name, email: user.email });
  } catch (error) {

    res.status(500).json({ message: 'Server error' });
  }
}

const uploadProfileImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image uploaded or invalid file type.' });
  }

  const newImageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

  try {
    const user = await User.findById(req.user._id);
    if (user && user.profileImage) {
      const previousImagePath = path.join(__dirname, '..', user.profileImage.split('/uploads/')[1]);

      // Delete the previous image file from the server
      fs.unlink(previousImagePath, (err) => {
        if (err) {
          console.error('Error deleting previous image:', err);
        } else {
          console.log('Previous image deleted successfully');
        }
      });
    }
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { profileImage: newImageUrl },
      { new: true }
    );

    return res.json({ message: 'Profile image uploaded successfully', imageUrl: newImageUrl, user: updatedUser });
  } catch (error) {
    return res.status(500).json({ message: 'Error uploading profile image' });
  }
};


const getProfileImageUrl = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('profileImage');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ profileImage: user.profileImage });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching profile image URL' });
  }
};

export {
  signup,
  verifyOtp,
  resendOtp,
  login,
  signout,
  forgotPassword,
  resetPassword,
  updateProfile,
  getProfileData,
  uploadProfileImage,
  getProfileImageUrl,
  getOwner
};
