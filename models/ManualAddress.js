import { Schema, model } from "mongoose";

const ManualAddressSchema = new Schema(
    {
        city: {
            type: String,
            required: true,
            trim: true,
            index: true, // 🔑 fast search by city
        },
        uniqueCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true, // 🔑 fast lookup
        },
        state: {
            type: String,
            trim: true,
            default: null,
        },
        country: {
            type: String,
            trim: true,
            default: "India", // default country
        },

        isActive: {
            type: Boolean,
            default: true, // active by default
            index: true,
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number], // [lng, lat]
            },
        },
    },
    {
        timestamps: true,
    }
);

// 🔑 GeoSpatial Index (for near queries)
ManualAddressSchema.index({ location: "2dsphere" });

export default model("ManualAddress", ManualAddressSchema);
