import bcrypt from 'bcryptjs';
import User from '../models/userModel.js';
import { generateToken } from '../config/jwt.js';
import { sendWhatsAppOtp, verifyWhatsAppOtp } from '../utils/whatapp.js';
import { generateReferralCode } from '../utils/Referalcode.js';
import fs from 'fs';
import path from 'path';



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
      type: 'user',
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
      token: generateToken(user._id),
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

    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid phone number or password' });
    }

    // Update device token
    if (deviceToken) {
      user.devicetoken = deviceToken;
      await user.save();
    }

    res.json({
      token: generateToken(user._id),
      name: user.name,
      type: user.type,
      isApproved: user.isVerified,
      isProfileCompleted: user.isProfileCompleted,
      message: 'Login successful'
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
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
