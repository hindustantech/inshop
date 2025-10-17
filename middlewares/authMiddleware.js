import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';

const JWTS = process.env.JWT_SECRET;
const authMiddleware = async (req, res, next) => {
  try {
    // 1) Get token from header or cookie
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // 2) Check if token exists and is a string
    if (!token || typeof token !== 'string' || token.trim() === '') {
      console.warn('No valid token provided:', {
        headers: req.headers.authorization,
        cookies: req.cookies,
      });
      return res.status(401).json({ message: 'No valid token provided, authorization denied' });
    }

    // 3) Verify token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined in environment variables');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error('JWT Verification Error:', {
        error: err.message,
        token: token.substring(0, 10) + '...' // Log partial token for debugging
      });
      return res.status(401).json({ message: 'Invalid or malformed token' });
    }

    if (!decoded || !decoded.id) {
      console.warn('Invalid token payload:', decoded);
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    // 4) Fetch user from DB
    const user = await User.findById(decoded.id).select('-password -otp -__v');
    if (!user) {
      console.warn('User not found for ID:', decoded.id);
      return res.status(401).json({ message: 'User not found, authorization denied' });
    }

    // 5) Attach user object to request
    req.user = user;
    req.token = token; // Optionally attach token for further use
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ message: 'Authentication error' });
  }
};




export default authMiddleware;
  







