// const jwt = require('jsonwebtoken');
import jwt from 'jsonwebtoken';
// utils/jwt.js

import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
// const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const generateToken = (userId, type) => {
  return jwt.sign(
    { id: userId, type }, // 👈 type included
    JWT_SECRET,

  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};


export { generateToken, verifyToken };
// module.exports = { generateToken, verifyToken };