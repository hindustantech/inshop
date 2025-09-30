import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true, // Prevent duplicate categories
    },
    slug: {
      type: String,
      required: true,
      unique: true, // Useful for SEO-friendly URLs
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    }, 
    isActive: {
      type: Boolean,
      default: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // To track which user/admin created it
    },
  },
  { timestamps: true }
);

const Category = mongoose.model("Category", categorySchema);

export default Category;
