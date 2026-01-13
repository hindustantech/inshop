
import mongoose from 'mongoose';
const couponSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["draft", "published", "expired", "disabled"],
    default: "draft",
    index: true,
  },

  shop_name: {
    type: String,
    require: true,
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
  },
  inmortal: {
    type: Boolean,
    default: false,

  },
  createdby: {
    type: mongoose.Schema.Types.ObjectId, // references id from another table
    ref: 'User', // assuming you have an 'Owner' model or similar
    required: true
  },
  copuon_image: {
    type: [String]
  },
  manul_address: {
    type: String,
    required: true,
    trim: true,
    index: true, // 🔑 fast lookup

  },

  copuon_srno: {
    type: String,
    require: true,
  },

  promotion: [
    {
      type: mongoose.Schema.Types.ObjectId, // references id from another table
      ref: 'Ad',
    }
  ],

  category: [{
    type: mongoose.Schema.Types.ObjectId, // references id from another table
    ref: 'Category', // assuming you have an 'Owner' model or similar
    required: true,
  }],

  copuon_type: {
    type: Boolean,
    default: false, // if False then  not Transfarel
  },
  discountPercentage: {
    type: String,
    required: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId, // references id from another table
    ref: 'User', // assuming you have an 'Owner' model or similar
    required: true
  },
  validFrom: {
    type: Date,
  },
  lockCoupon: {
    type: Boolean,
    default: false,
    index: true
  }

  ,
  validityDays: {
    type: Number,
    default: 15,
    min: 1,
  },

  validTill: {
    type: Date,
    default: function () {
      return new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    },
  },


  creationDate: {
    type: Date,
    default: Date.now
  },
  style: {
    type: mongoose.Schema.Types.Mixed, // JSON object
    required: false
  },
  active: {
    type: Boolean,
    default: true
  },
  maxDistributions: {
    type: Number,
    default: 0,
    min: 0,
    required: false
  },
  currentDistributions: {
    type: Number,
    default: 0,
    min: 0,
    required: false
  },



  fromTime: {
    type: String,
    required: function () {
      return !this.isFullDay; // required only if full day is NOT checked
    }
  },
  coupon_color: {
    type: String,
    required: true,
    default: '#FFFFFF'
  },

  toTime: {
    type: String,
    required: function () {
      return !this.isFullDay; // required only if full day is NOT checked
    }
  },
  approveowner: {
    type: Boolean,
    default: false
  },
  shope_location: {
    address: {
      type: String
    },
    type: {
      type: String,
      enum: ["Point"], // GeoJSON type
      required: true,
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function (val) {
          return val.length === 2;
        },
        message: "Coordinates must be [longitude, latitude]",
      },
    },
  },

  isFullDay: {
    type: Boolean,
    default: false
  },
  termsAndConditions: {
    type: String,
    required: true // इसको fill करना जरूरी होगा
  },
  is_spacial_copun: {
    type: Boolean,
    default: false, //if false  then not a spcical copun
  },
  is_spacial_copun_user: [
    {
      type: mongoose.Schema.Types.ObjectId, // references id from another table
      ref: 'User', // assuming you have an 'Owner' model or similar

    }
  ],

  isTransferable: {
    type: Boolean,
    default: false // Default: not transferable
  },

  tag: {
    type: [String],
    require: true,
  },


});

couponSchema.index({ shope_location: '2dsphere' });

couponSchema.index({ promotion: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
