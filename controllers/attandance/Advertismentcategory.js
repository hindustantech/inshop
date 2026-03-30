import AdvertisementCategory from "../../models/Attandance/AdvertisementCategory.js";



// @desc    Create a new advertisement category
// @route   POST /api/advertisement-categories
// @access  Private/Admin
export const createCategory = async (req, res) => {
    try {
        const { name, description, slug, status } = req.body;

        // Check if category with same name or slug already exists
        const existingCategory = await AdvertisementCategory.findOne({
            $or: [{ name }, { slug }]
        });

        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: "Category with this name or slug already exists"
            });
        }

        const category = await AdvertisementCategory.create({
            name,
            description,
            slug,
            status
        });

        res.status(201).json({
            success: true,
            message: "Advertisement category created successfully",
            data: category
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating advertisement category",
            error: error.message
        });
    }
};

// @desc    Update an existing advertisement category
// @route   PUT /api/advertisement-categories/:id
// @access  Private/Admin
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, slug, status } = req.body;

        // Check if category exists
        const category = await AdvertisementCategory.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Advertisement category not found"
            });
        }

        // Check for duplicate name or slug (excluding current category)
        if (name || slug) {
            const duplicateCheck = await AdvertisementCategory.findOne({
                $and: [
                    { _id: { $ne: id } },
                    { $or: [{ name }, { slug }] }
                ]
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: "Category with this name or slug already exists"
                });
            }
        }

        // Update category
        const updatedCategory = await AdvertisementCategory.findByIdAndUpdate(
            id,
            {
                name: name || category.name,
                description: description || category.description,
                slug: slug || category.slug,
                status: status || category.status
            },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: "Advertisement category updated successfully",
            data: updatedCategory
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating advertisement category",
            error: error.message
        });
    }
};

// @desc    Delete an advertisement category
// @route   DELETE /api/advertisement-categories/:id
// @access  Private/Admin
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await AdvertisementCategory.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Advertisement category not found"
            });
        }

        await category.deleteOne();

        res.status(200).json({
            success: true,
            message: "Advertisement category deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting advertisement category",
            error: error.message
        });
    }
};

// @desc    Toggle category status (active/inactive)
// @route   PATCH /api/advertisement-categories/:id/toggle-status
// @access  Private/Admin

export const toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await AdvertisementCategory.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Advertisement category not found"
            });
        }

        // Toggle status
        category.status = category.status === "active" ? "inactive" : "active";
        await category.save();

        res.status(200).json({
            success: true,
            message: `Category status toggled to ${category.status}`,
            data: category
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling category status",
            error: error.message
        });
    }
};

// @desc    Get all advertisement categories
// @route   GET /api/advertisement-categories
// @access  Public

export const getAllCategories = async (req, res) => {
    try {
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Filtering
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }

        // Sorting
        const sort = {};
        if (req.query.sortBy) {
            const parts = req.query.sortBy.split(':');
            sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = -1; // Default sort by newest first
        }

        // Search
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } },
                { slug: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const categories = await AdvertisementCategory.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const total = await AdvertisementCategory.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: categories,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching advertisement categories",
            error: error.message
        });
    }
};

// @desc    Get single advertisement category by ID
// @route   GET /api/advertisement-categories/:id
// @access  Public

export const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await AdvertisementCategory.findById(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Advertisement category not found"
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching advertisement category",
            error: error.message
        });
    }
};

// @desc    Get all active categories (for frontend dropdowns)
// @route   GET /api/advertisement-categories/active
// @access  Public

export const getActiveCategories = async (req, res) => {
    try {
        const categories = await AdvertisementCategory.find({ status: "active" })
            .select('name slug description')
            .sort('name');

        res.status(200).json({
            success: true,
            data: categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching active categories",
            error: error.message
        });
    }
};