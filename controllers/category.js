// controllers/category.js
import Category from "../models/CategoryCopun.js";
import mongoose from "mongoose";
import { uploadToCloudinary } from "../utils/Cloudinary.js";



export const createCategory = async (req, res) => {
  try {
    const { name, slug, description, tags } = req.body;

    /* ===============================
       Validation
    =============================== */

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Name and slug are required",
      });
    }

    const existingCategory = await Category.findOne({
      $or: [{ slug }, { name }],
    });

    if (existingCategory) {
      return res.status(409).json({
        success: false,
        message: "Category already exists",
      });
    }

    /* ===============================
       Image Upload
    =============================== */

    let imageUrl = null;

    if (req.file?.buffer) {
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "categories"
      );

      imageUrl = uploadResult.secure_url;
    }

    /* ===============================
       Create Category
    =============================== */

    const category = await Category.create({
      name,
      slug,
      description,
      tags: tags ? tags.split(",") : [],
      image: imageUrl,
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error("Create Category Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get All Categories (with pagination, search, and access control)
export const getCategories = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.search?.trim() || "";

    let query = {};

    /* ---------------- Search Filter ---------------- */
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    /* ------------- Role Based Filter -------------- */
    if (!req.user || req.user.type !== "super_admin") {

      const roleFilter = {
        $and: [
          { isActive: true },
          {
            $or: [
              { occasion: false },
              { occasion: { $exists: false } }
            ]
          }
        ]
      };

      // Merge search + role filter safely
      query = Object.keys(query).length
        ? { $and: [query, roleFilter] }
        : roleFilter;
    }

    const skip = (page - 1) * limit;

    const [categories, total] = await Promise.all([
      Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Category.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      categories,
    });

  } catch (error) {
    console.error("getCategories Error:", error);

    res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
};



export const getActiveOccasionCategories = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.search?.trim() || "";

    const query = {
      occasion: true,
      isActive: true, // Only active occasions
    };

    /* ---------------- Search Filter ---------------- */
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    /* ---------------- Pagination ---------------- */
    const skip = (page - 1) * limit;

    /* ---------------- Database ---------------- */
    const [categories, total] = await Promise.all([
      Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Category.countDocuments(query),
    ]);

    /* ---------------- Response ---------------- */
    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      categories,
    });
  } catch (error) {
    console.error("getActiveOccasionCategories Error:", error);

    res.status(500).json({
      success: false,
      message: "Error fetching occasion categories",
      error: error.message,
    });
  }
};
// Get Single Category (restrict inactive categories to super_admin)
export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Restrict inactive category access to super_admin
    if (!category.isActive && (!req.user || req.user.userType !== "super_admin")) {
      return res.status(403).json({ message: "Access denied: Inactive category" });
    }

    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: "Error fetching category", error: error.message });
  }
};

// Update Category (unchanged)
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, tags } = req.body;

    /* ===============================
       Validation
    =============================== */

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID"
      });
    }

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Name and slug are required",
      });
    }

    // Check for duplicate category (excluding current category)
    const existingCategory = await Category.findOne({
      $or: [{ slug }, { name }],
      _id: { $ne: id }
    });

    if (existingCategory) {
      return res.status(409).json({
        success: false,
        message: "Category with this name or slug already exists",
      });
    }

    /* ===============================
       Find existing category
    =============================== */

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    /* ===============================
       Image Upload
    =============================== */

    let imageUrl = category.image; // Keep existing image by default

    if (req.file?.buffer) {
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "categories"
      );

      imageUrl = uploadResult.secure_url;

      // Optional: Delete old image from Cloudinary if exists
      // if (category.image) {
      //   await deleteFromCloudinary(category.image);
      // }
    }

    /* ===============================
       Prepare update data
    =============================== */

    const updateData = {
      name,
      slug,
      description,
      tags: tags ? tags.split(",").map(tag => tag.trim()) : category.tags,
      image: imageUrl,
      updatedAt: Date.now(),
    };

    /* ===============================
       Update Category
    =============================== */

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    });

  } catch (error) {
    console.error("Update Category Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Toggle Category Status (replaces deleteCategory)
export const toggleCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    // Restrict toggle to super_admin
    if (!req.user || req.user.type !== "super_admin") {
      return res.status(403).json({ message: "Access denied: Super admin only" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    category.isActive = !category.isActive;
    await category.save();

    res.status(200).json({
      message: `Category ${category.isActive ? "activated" : "deactivated"} successfully`,
      category,
    });
  } catch (error) {
    res.status(500).json({ message: "Error toggling category status", error: error.message });
  }
};



export const convetintoOccasion = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const category = await Category.findByIdAndUpdate(
      id,
      [
        {
          $set: {
            occasion: { $not: "$occasion" },
          },
        },
      ],
      { new: true }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Category occasion ${category.occasion ? "enabled" : "disabled"
        } successfully`,
      data: category,
    });

  } catch (error) {
    console.error("Toggle Occasion Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};