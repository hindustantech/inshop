import User from "../models/userModel.js";
// Common function for pagination + search + filter
export const fetchUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "", filterKey, filterValue, role } = req.query;

        // Base query
        let query = { type: role };

        // 🔎 Search by name, email, phone
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        // 🎯 Filter from `data` field
        if (filterKey && filterValue) {
            query[`data.${filterKey}`] = { $regex: filterValue, $options: "i" };
        }

        const users = await User.find(query)
            .sort({ createdAt: -1 }) // 📌 latest first
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            users,
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
