import mongoose from "mongoose";

const BannerSchema = new mongoose.Schema(
    {
        createdBy: {
            id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            type: {
                type: String,
                enum: ["partner", "agency"], // future: ["admin", "superadmin"]
                required: true,
            },
        },

        banner_image: {
            type: String,
            required: true,
        },

        google_location_url: {
            type: String,
        },

        banner_type: {
            type: String,
            enum: ["Changeable", "Unchangeable"],
            default: "Unchangeable",
        },

        // Default search radius (100 km = 100,000 meters)
        search_radius: {
            type: Number,
            default: 100000, // meters
        },

        location: {
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

        title: {
            type: String,
        },
        main_keyword: {
            type: [String],
        },
        keyword: {
            type: [String],
        },
    },
    { timestamps: true }
);

// ✅ Geospatial Index
BannerSchema.index({ location: "2dsphere" });

// Optional Indexes
BannerSchema.index({ banner_type: 1 });
BannerSchema.index({ title: "text", keyword: "text" });

const Banner = mongoose.model("Banner", BannerSchema);

export default Banner;
