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
    console.error("Error fetching user profile:", error);
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
    console.error("Error updating profile image:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const broadcastNotification = async (req, res) => {
  const startTime = Date.now();
  let processedCount = 0;

  try {
    // Input validation
    const { address, title, body, data = {}, delay = 50, concurrency = 5, type = 'broadcast' } = req.body;

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

    console.log(`🔔 Starting notification broadcast: ${title}`);

    // Construct query based on address type
    const query = Array.isArray(address)
      ? { manul_address: { $in: address }, devicetoken: { $ne: null, $ne: '' } }
      : { manul_address: address, devicetoken: { $ne: null, $ne: '' } };

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

    console.log(`📱 Found ${users.length} users with device tokens`);

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
      console.log(`📊 Progress: ${progress}% (${processedCount}/${users.length})`);

      // Delay between batches
      if (delay > 0 && i + concurrency < users.length) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Cleanup invalid tokens
    if (results.invalidTokens.length > 0) {
      await cleanupInvalidTokensBulk(results.invalidTokens);
      console.log(`🧹 Cleaned up ${results.invalidTokens.length} invalid tokens`);
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

    console.log(
      `✅ Broadcast completed in ${duration}s: ${results.totalSuccess} successful, ${results.totalFailures} failed`
    );

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
    console.error('❌ Error broadcasting notification:', error);
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
    console.log(`Successfully cleaned up ${invalidTokens.length} invalid tokens`);
  } catch (error) {
    console.error('❌ Error cleaning up invalid tokens:', error);
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
    const userId = req.user.id;

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
      { new: true } // return the updated document
    );

    res.status(200).json({
      success: true,
      message: "Manual address updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


const signup = async (req, res) => {
  try {
    const { name, email, phone, type, password, referralCode } = req.body;


    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Name, email, phone, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    if (referralCode && !/^(IN\d{6})$/.test(referralCode)) {
      return res.status(400).json({ message: 'Invalid referral code format' });
    }

    if (!["user", "partner", "agency"].includes(type)) {
      return res.status(401).json({ success: false, message: "Unauthorized Access Denied" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or phone already exists' });
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
      name,
      email,
      type,
      phone,
      password: hashedPassword,
      type,
      referalCode: uniqueReferralCode,
      referredBy: referralCode || null,
    });

    // Send WhatsApp OTP
    const otpResponse = await sendWhatsAppOtp(phone);
    console.log(otpResponse);
    if (!otpResponse.success) {
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
    res.status(500).json({ message: 'Signup failed', error: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify WhatsApp OTP
    const verifyResponse = await verifyWhatsAppOtp(user.whatsapp_uid, otp);
    if (!verifyResponse.success) {
      return res.status(400).json({ message: 'Invalid OTP', error: verifyResponse.error });
    }

    // Update user verification status
    user.isVerified = true;
    user.otp = null;
    await user.save();

    res.json({
      message: 'OTP verified successfully',
      token: generateToken(user._id, user.type),
      name: user.name,
      type: user.type,
      isVerified: user.isVerified,
      isProfileCompleted: user.isProfileCompleted
    });
  } catch (error) {
    res.status(500).json({ message: 'OTP verification failed', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { phone, password, deviceToken } = req.body;

    // Check if phone & password are provided
    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    // Find user by phone
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'Invalid phone number or password' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid phone number or password' });
    }

    // Update device token if provided
    if (deviceToken) {
      user.devicetoken = deviceToken; // ensure your schema field is `deviceToken` not `devicetoken`
      await user.save();
    }

    // ✅ Always make sure generateToken receives valid params
    const token = generateToken(user._id.toString(), user.type);

    return res.json({
      token,
      name: user.name,
      type: user.type,
      isApproved: user.isVerified,        // make sure field names match your schema
      isProfileCompleted: user.isProfileCompleted,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error); // helps debugging
    return res.status(500).json({ message: 'Login failed', error: error.message });
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

    console.log('UserID:', userId);
    console.log('Request Body:', req.body);

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
    console.error('Error updating profile:', error);
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
    console.error('Error getting profile data:', error);
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
    console.error('Error getting Owner data:', error);
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

    console.log({ message: 'Profile image uploaded successfully', imageUrl: newImageUrl, user: updatedUser });
    return res.json({ message: 'Profile image uploaded successfully', imageUrl: newImageUrl, user: updatedUser });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    return res.status(500).json({ message: 'Error uploading profile image' });
  }
};


const getProfileImageUrl = async (req, res) => {
  try {
    console.log(req.user)
    const user = await User.findById(req.user._id).select('profileImage');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ profileImage: user.profileImage });
  } catch (error) {
    console.error('Error fetching profile image URL:', error);
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
