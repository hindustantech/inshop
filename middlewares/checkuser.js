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
            req.user = null; // User not found, continue without authentication
            return next();
        }

        // 3) Fetch user from DB
        const user = await User.findById(decoded.id).select('-password -otp -__v');
        if (!user) {
            req.user = null; // User not found, continue without authentication
            return next();
        }

        // 4) Attach user object (safe + token info)
        req.user = user;

        next();
    } catch (error) {
        console.error('Auth Middleware Error:', error.message);
        return res.status(500).json({ message: 'Authentication error' });
    }
};


// 🛡️ Check if user is super admin
export const isSuperAdmin = (req, res, next) => {
  try {
    if (req.user && req.user.type === "super_admin") {
      return next();
    }
    return res.status(403).json({ error: "Access denied. Super Admin only." });
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
