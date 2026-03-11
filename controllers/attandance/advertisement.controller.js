import Advertistment from "../../models/Attandance/Advertistment.js";
import AdvertisementCategory from "../../models/Attandance/AdvertisementCategory.js";
import mongoose from "mongoose";

// @desc    Create a new advertisement
// @route   POST /api/advertisements
// @access  Private/Admin
export const createAdvertisement = async (req, res) => {
    try {
        const { title, description, imageUrl, linkUrl, category, status } = req.body;

        // Check if category exists
        const categoryExists = await AdvertisementCategory.findById(category);
        if (!categoryExists) {
            return res.status(400).json({
                success: false,
                message: "Invalid category ID"
            });
        }

        const advertisement = await Advertistment.create({
            title,
            description,
            imageUrl,
            linkUrl,
            category,
            status
        });

        // Populate category details
        const populatedAd = await Advertistment.findById(advertisement._id)
            .populate('category', 'name slug');

        res.status(201).json({
            success: true,
            message: "Advertisement created successfully",
            data: populatedAd
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating advertisement",
            error: error.message
        });
    }
};

// @desc    Update an existing advertisement
// @route   PUT /api/advertisements/:id
// @access  Private/Admin
export const updateAdvertisement = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, imageUrl, linkUrl, category, status } = req.body;

        // Check if advertisement exists
        const advertisement = await Advertistment.findById(id);
        if (!advertisement) {
            return res.status(404).json({
                success: false,
                message: "Advertisement not found"
            });
        }

        // If category is being updated, check if it exists
        if (category) {
            const categoryExists = await AdvertisementCategory.findById(category);
            if (!categoryExists) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid category ID"
                });
            }
        }

        // Update advertisement
        const updatedAdvertisement = await Advertistment.findByIdAndUpdate(
            id,
            {
                title: title || advertisement.title,
                description: description || advertisement.description,
                imageUrl: imageUrl || advertisement.imageUrl,
                linkUrl: linkUrl || advertisement.linkUrl,
                category: category || advertisement.category,
                status: status || advertisement.status
            },
            { new: true, runValidators: true }
        ).populate('category', 'name slug');

        res.status(200).json({
            success: true,
            message: "Advertisement updated successfully",
            data: updatedAdvertisement
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating advertisement",
            error: error.message
        });
    }
};

// @desc    Delete an advertisement
// @route   DELETE /api/advertisements/:id
// @access  Private/Admin
export const deleteAdvertisement = async (req, res) => {
    try {
        const { id } = req.params;

        const advertisement = await Advertistment.findById(id);
        if (!advertisement) {
            return res.status(404).json({
                success: false,
                message: "Advertisement not found"
            });
        }

        await advertisement.deleteOne();

        res.status(200).json({
            success: true,
            message: "Advertisement deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting advertisement",
            error: error.message
        });
    }
};

// @desc    Toggle advertisement status (active/inactive)
// @route   PATCH /api/advertisements/:id/toggle-status
// @access  Private/Admin
export const toggleAdvertisementStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const advertisement = await Advertistment.findById(id);
        if (!advertisement) {
            return res.status(404).json({
                success: false,
                message: "Advertisement not found"
            });
        }

        // Toggle status
        advertisement.status = advertisement.status === "active" ? "inactive" : "active";
        await advertisement.save();

        const updatedAd = await Advertisement.findById(id)
            .populate('category', 'name slug');

        res.status(200).json({
            success: true,
            message: `Advertisement status toggled to ${advertisement.status}`,
            data: updatedAd
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling advertisement status",
            error: error.message
        });
    }
};

// @desc    Get only active advertisements
// @route   GET /api/advertisements/active
// @access  Public
export const getActiveAdvertisements = async (req, res) => {
    try {
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Filter by category if provided
        const filter = { status: "active" };
        if (req.query.category) {
            filter.category = req.query.category;
        }

        const advertisements = await Advertistment.find(filter)
            .populate('category', 'name slug description')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);

        const total = await Advertistment.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: advertisements,
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
            message: "Error fetching active advertisements",
            error: error.message
        });
    }
};

// @desc    Get all advertisements (with filters and pagination)
// @route   GET /api/advertisements
// @access  Public/Admin
export const getAllAdvertisements = async (req, res) => {
    try {
        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Build filter
        const filter = {};
        
        // Filter by status
        if (req.query.status) {
            filter.status = req.query.status;
        }

        // Filter by category
        if (req.query.category) {
            filter.category = req.query.category;
        }

        // Search by title or description
        if (req.query.search) {
            filter.$or = [
                { title: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) {
                filter.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                filter.createdAt.$lte = new Date(req.query.endDate);
            }
        }

        // Sorting
        const sort = {};
        if (req.query.sortBy) {
            const parts = req.query.sortBy.split(':');
            sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = -1; // Default sort by newest
        }

        const advertisements = await Advertistment.find(filter)
            .populate('category', 'name slug description status')
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const total = await Advertistment.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: advertisements,
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
            message: "Error fetching advertisements",
            error: error.message
        });
    }
};

// @desc    Get single advertisement by ID
// @route   GET /api/advertisements/:id
// @access  Public
export const getAdvertisementById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid advertisement ID format"
            });
        }

        const advertisement = await Advertistment.findById(id)
            .populate('category', 'name slug description');

        if (!advertisement) {
            return res.status(404).json({
                success: false,
                message: "Advertisement not found"
            });
        }

        res.status(200).json({
            success: true,
            data: advertisement
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching advertisement",
            error: error.message
        });
    }
};

// @desc    Get advertisements by category
// @route   GET /api/advertisements/category/:categoryId
// @access  Public
export const getAdvertisementsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;

        // Check if category exists
        const category = await AdvertisementCategory.findById(categoryId);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Filter by status if specified, otherwise show all
        const filter = { category: categoryId };
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const advertisements = await Advertistment.find(filter)
            .populate('category', 'name slug')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);

        const total = await Advertistment.countDocuments(filter);

        res.status(200).json({
            success: true,
            category: {
                id: category._id,
                name: category.name,
                slug: category.slug
            },
            data: advertisements,
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
            message: "Error fetching advertisements by category",
            error: error.message
        });
    }
};

// @desc    Bulk update advertisements status
// @route   PATCH /api/advertisements/bulk-status
// @access  Private/Admin
export const bulkUpdateStatus = async (req, res) => {
    try {
        const { advertisementIds, status } = req.body;

        if (!advertisementIds || !Array.isArray(advertisementIds) || advertisementIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of advertisement IDs"
            });
        }

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be either 'active' or 'inactive'"
            });
        }

        const result = await Advertistment.updateMany(
            { _id: { $in: advertisementIds } },
            { $set: { status } }
        );

        res.status(200).json({
            success: true,
            message: `Updated ${result.modifiedCount} advertisements`,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error bulk updating advertisements",
            error: error.message
        });
    }
};

// @desc    Delete multiple advertisements
// @route   DELETE /api/advertisements/bulk
// @access  Private/Admin
export const bulkDeleteAdvertisements = async (req, res) => {
    try {
        const { advertisementIds } = req.body;

        if (!advertisementIds || !Array.isArray(advertisementIds) || advertisementIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of advertisement IDs"
            });
        }

        const result = await Advertistment.deleteMany({
            _id: { $in: advertisementIds }
        });

        res.status(200).json({
            success: true,
            message: `Deleted ${result.deletedCount} advertisements`,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error bulk deleting advertisements",
            error: error.message
        });
    }
};