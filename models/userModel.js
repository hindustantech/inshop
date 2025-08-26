// const mongoose = require('mongoose');
import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  uid: { type: String, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  otp: { type: String, default: null },
  isVerified: { type: Boolean, default: false },
  isProfileCompleted: { type: Boolean, default: false },
  type: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: false },
  profileImage: { type: String, required: false, unique: false },
  createdCouponsId: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Coupon',
    default: []
  },
  availedCouponsId: [
    {
      couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon'
      },
      dateAdded: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['ACTIVE', 'EXPIRED', 'REDEEMED'],
        default: 'REDEEMED'
      },
      totalPrice: {
        type: Number,
        required: true,
        default: 0
      }
    }
  ],
  couponCount: {
    type: Number,
    required: true,
    default: 2
  }, 
  phone: {
    type: String,
    required: false,
    unique: true,
  }
}, {
  timestamps: true
});

// Generate a unique ID field with format of U-xxxxxx, ensuring both letters and numbers
userSchema.pre('save', async function(next) {
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 5;

  const generateAlphanumeric = () => {
    const numbers = '0123456789';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    // Ensure at least one number and one letter
    const randomNumber = numbers[Math.floor(Math.random() * numbers.length)];
    const randomLetter = letters[Math.floor(Math.random() * letters.length)];
    
    // Generate the remaining 4 characters
    let remaining = '';
    const allChars = numbers + letters;
    for(let i = 0; i < 4; i++) {
      remaining += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Mix them together randomly
    const combined = randomNumber + randomLetter + remaining;
    return 'U-' + combined.split('').sort(() => Math.random() - 0.5).join('');
  };

  while (!isUnique && attempts < maxAttempts) {
    const generatedUid = generateAlphanumeric();
    const existingUser = await mongoose.model('User').findOne({ uid: generatedUid });
    
    if (!existingUser) {
      this.uid = generatedUid;
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    return next(new Error('Could not generate unique UID after maximum attempts'));
  }
  next();
});

const User = mongoose.model('User', userSchema);
export default User;
