import mongoose from "mongoose";

const advertisementCategorySchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    description: {
        type: String
    },

    // example: carousel, square, banner, popup
    slug: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active",
        index: true
    }

}, { timestamps: true });

export default mongoose.model("AdvertisementCategory", advertisementCategorySchema);