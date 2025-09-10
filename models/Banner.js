import mongoose from "mongoose";

const BannerSchema = new mongoose.Schema(
  {
    createdBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      type: { type: String, enum: ["partner", "agency"], required: true, index: true },
    },

    manual_address: { type: String, required: true, trim: true, index: true },

    banner_image: { type: String, required: true },

    google_location_url: { type: String },

    banner_type: { type: String, enum: ["Changeable", "Unchangeable"], default: "Unchangeable", index: true },

    search_radius: { type: Number, default: 100000 }, // meters

    location: {
      type: { type: String, enum: ["Point"], required: true, default: "Point" },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
        validate: { validator: (val) => val.length === 2, message: "Coordinates must be [lng, lat]" },
      },
    },

    title: { type: String },
    main_keyword: { type: [String], index: true },
    keyword: { type: [String], index: true },

    // ✅ Expiry field for TTL
    expiryAt: { type: Date, default: null }, // set when creating banner
  },
  { timestamps: true }
);

/* =============================
   Indexes
============================= */

// Geospatial
BannerSchema.index({ location: "2dsphere" });

// Text search
BannerSchema.index({ title: "text", keyword: "text", main_keyword: "text" });

// Compound index
BannerSchema.index({ manual_address: 1, banner_type: 1 });

// TTL index: automatically remove expired banners
BannerSchema.index({ expiryAt: 1 }, { expireAfterSeconds: 0 });

const Banner = mongoose.model("Banner", BannerSchema);
export default Banner;
