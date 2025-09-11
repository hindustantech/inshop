import Category from "../models/CategoryCopun.js";
import mongoose from "mongoose";

// Create Category
export const createCategory = async (req, res) => {
  try {
    const { name, slug, description, tags } = req.body;

    const categoryExists = await Category.findOne({ slug });
    if (categoryExists) {
      return res.status(400).json({ message: "Category with this slug already exists" });
    }

    const category = new Category({
      name,
      slug,
      description,
      tags,
      createdBy: req.user ? req.user._id : null, // If user is authenticated
    });

    await category.save();
    res.status(201).json({ message: "Category created successfully", category });
  } catch (error) {
    res.status(500).json({ message: "Error creating category", error: error.message });
  }
};

// Get All Categories (with pagination, search, active filter)
export const getCategories = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", active } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }
    if (active !== undefined) {
      query.isActive = active === "true";
    }

    const categories = await Category.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Category.countDocuments(query);

    res.status(200).json({
      total,
      page: Number(page),
      limit: Number(limit),
      categories,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error: error.message });
  }
};

// Get Single Category
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

    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: "Error fetching category", error: error.message });
  }
};

// Update Category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findByIdAndUpdate(id, updates, { new: true });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category updated successfully", category });
  } catch (error) {
    res.status(500).json({ message: "Error updating category", error: error.message });
  }
};

// Delete Category
// Deactivate Category (Soft Delete)
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (!category.isActive) {
      return res.status(400).json({ message: "Category is already deactivated" });
    }

    category.isActive = false;
    await category.save();

    res.status(200).json({ message: "Category deactivated successfully", category });
  } catch (error) {
    res.status(500).json({ message: "Error deactivating category", error: error.message });
  }
};
