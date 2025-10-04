import mongoose from "mongoose";

const PromotionalBannerSchema = new mongoose.Schema(
    {
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },



        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            trim: true,
        },

        bannerImage: [{
            type: String,
            required: true,
        }],



        // Targeting
        manualAddress: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },


        location: {
            type: { type: String, enum: ["Point"], required: true, default: "Point" },
            coordinates: {
                type: [Number], // [lng, lat]
                required: true,
                validate: {
                    validator: (val) => val.length === 2,
                    message: "Coordinates must be [lng, lat]",
                },
            },
        },

        searchRadius: {
            type: Number,
            default: 100000, // meters
        },

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },


        // Expiry
        expiryAt: { type: Date, default: null },
    },
    { timestamps: true }
);



// Geospatial
PromotionalBannerSchema.index({ location: "2dsphere" });

// Compound index
PromotionalBannerSchema.index({ manualAddress: 1, bannerType: 1 });

// TTL index
PromotionalBannerSchema.index({ expiryAt: 1 }, { expireAfterSeconds: 0 });

const PromotionalBanner = mongoose.model(
    "PromotionalBanner",
    PromotionalBannerSchema
);

export default PromotionalBanner;
