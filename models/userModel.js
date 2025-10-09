// const mongoose = require('mongoose');
import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  uid: {
    type: String, unique: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  whatsapp_uid: {
    type: String,
    maxlength: 500 // Increased length to handle long UIDs
  },
  password: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    default: null
  },
  suspend: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  referalCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referrelCommisationType: {
    type: String,
    enum: ["fixed", "percentage"], // enum values must be strings
    default: "fixed", // you can set default as "fixed" or "percentage"
  },

  referrelCommisation: {
    type: Number, // should be Number, not String or Boolean
    default: 0,   // default commission value
  },
  referredBy: {
    type: String,
    default: null
  },
  referaluseCount: {
    type: String,
    default: false
  },
  isProfileCompleted: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    required: true,
    enum: ['user', 'partner', 'agency', 'super_admin'],
    default: 'user'
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  phone: {
    type: String,
    required: false,
    unique: true,
  },
  profileImage: {
    type: String,
    required: false,
    unique: false
  },
  createdCouponsId: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Coupon',
    default: []
  },
  devicetoken: {
    type: String,
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
    default: 5
  },

  manul_address: {
    type: String,
    trim: true,
    index: true, // 🔑 fast lookup

  },
  // Store latest location in GeoJSON format
  latestLocation: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: [0, 0],
    },
  }

}, {
  timestamps: true
});

// Generate a unique ID field with format of U-xxxxxx, ensuring both letters and numbers
userSchema.pre('save', async function (next) {
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
    for (let i = 0; i < 4; i++) {
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

userSchema.index({ latestLocation: "2dsphere" });
userSchema.index({ referalCode: 1 });
const User = mongoose.model('User', userSchema);
export default User;
