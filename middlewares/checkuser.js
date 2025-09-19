import User from "../models/userModel.js";
import jwt from 'jsonwebtoken';

export const authMiddleware1 = async (req, res, next) => {
  try {
    // 1) Get token from header or cookie
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      req.user = null; // User not found, continue without authentication
      return next();
    }

    // 2) Verify token

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // 3) Fetch user from DB
    const user = await User.findById(decoded.id).select('-password -otp -__v');
    if (!user) {
      return res.status(401).json({ message: 'User not found, authorization denied' });
    }

    // 4) Attach user object (safe + token info)
    req.user = user;

    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    return res.status(500).json({ message: 'Authentication error' });
  }
};