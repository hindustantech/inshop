import { Schema, model } from "mongoose";

const shopVisitSchema = new Schema(
  {
    // 📅 Visit Info
    visitDate: {
      type: Date,
      required: true,
      index: true,
    },

    visited: {
      type: Boolean,
      default: false,
      index: true,
    },

    // 🏪 Shop Details
    shopName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    address: {
      type: String,
      required: true,
    },

    area: {
      type: String,
      required: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      match: /^[0-9]{10}$/,
      index: true,
    },

    category: {
      type: Schema.Types.ObjectId,
        ref: "Category",
    },

    // 💼 Business Conversion
    convertedToBusiness: {
      type: Boolean,
      default: false,
      index: true,
    },

    conversionDate: {
      type: Date,
    },

    // 🎟 Coupon / Banner Tracking
    campaign: {
      couponId: {
        type: Schema.Types.ObjectId,
        ref: "Coupon",
      },
      bannerId: {
        type: Schema.Types.ObjectId,
        ref: "Banner",
      },
      source: {
        type: String, // e.g. "push", "ads", "organic"
        enum: ["push", "ads", "organic", "referral"],
        default: "organic",
      },
    },

    // 💰 Revenue Tracking
    revenue: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
    },

    // 📊 Metadata (for scaling like Amazon analytics)
    meta: {
      deviceType: String,
      appVersion: String,
      ipAddress: String,
      geo: {
        lat: Number,
        lng: Number,
      },
    },

    // 👤 Assigned Sales Agent (optional for CRM scaling)
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    createdby: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // 🔄 Status Tracking
    status: {
      type: String,
      enum: ["lead", "visited","follow_up_visited","new_visited", "converted", "rejected"],
      default: "lead",
      index: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// 🚀 Compound Indexes (High Performance Queries)
shopVisitSchema.index({ area: 1, category: 1 });
shopVisitSchema.index({ visitDate: -1, convertedToBusiness: 1 });
shopVisitSchema.index({ phone: 1, shopName: 1 });

// 📈 Virtual for Conversion Rate Use
shopVisitSchema.virtual("isHighValue").get(function () {
  return this.revenue > 10000;
});

export default model("ShopVisit", shopVisitSchema);