import mongoose from "mongoose";

const mallSchema = new mongoose.Schema(
    {
        // Basic Info
        name: {
            type: String,
            required: [true, "Mall name is required"],
            trim: true,
        },

        tagline: {
            type: String,
            default: "",
        },

        description: {
            type: String,
            default: "",
        },

        // Contact & Communication
        contact: {
            phone: { type: String, default: "" },
            email: { type: String, default: "" },
            website: { type: String, default: "" },
        },

        // Location Information
        address: {
            street: { type: String, default: "" },
            area: { type: String, default: "" },
            city: { type: String, default: "" },
            state: { type: String, default: "" },
            country: { type: String, default: "India" },
            pincode: { type: String, default: "" },
        },

        // Geolocation for filtering / nearby search
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                required: true,
            },
        },

        // Media
        logo: {
            type: String,
            default: "",
        },

        manul_address: {
            type: String,
            required: true,
            trim: true,
            index: true, // 🔑 fast lookup

        },


        gallery: [
            {
                image: { type: String },
                caption: { type: String, default: "" },
            },
        ],

        // Facilities / Features
        facilities: {
            parking: { type: Boolean, default: false },
            foodCourt: { type: Boolean, default: false },
            kidsZone: { type: Boolean, default: false },
            wheelchairAccess: { type: Boolean, default: false },
            cinema: { type: Boolean, default: false },
            restrooms: { type: Boolean, default: true },
            atm: { type: Boolean, default: true },
            wifi: { type: Boolean, default: false },
        },

        // Timings
        timings: {
            open: { type: String, default: "10:00 AM" },
            close: { type: String, default: "10:00 PM" },
            closedOn: { type: String, default: "None" },
        },

        // Ratings & Reviews
        rating: {
            average: { type: Number, default: 0 },
            totalReviews: { type: Number, default: 0 },
        },

        // Relationships
        shops: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Shop",
            },
        ],

        coupons: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Coupon",
            },
        ],

        // Status & Analytics
        active: {
            type: Boolean,
            default: true,
        },

        totalVisitors: {
            type: Number,
            default: 0,
        },

        lastUpdated: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

// ✅ Index for geospatial queries
mallSchema.index({ location: "2dsphere" });

// Optional pre-save hook
mallSchema.pre("save", function (next) {
    this.lastUpdated = new Date();
    next();
});

export default mongoose.model("Mall", mallSchema);
