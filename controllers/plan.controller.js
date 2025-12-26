import Plan from "../models/Plan.js";

/* ============================
   Helper: Build Plan Filters
============================ */
const buildPlanFilter = ({ type, tier, eligibility, search }) => {
    const filter = {
        isActive: true,
        $or: [
            { validTill: { $exists: false } },
            { validTill: null },
            { validTill: { $gte: new Date() } },
        ],
    };

    if (type) filter.type = type;
    if (tier) filter.tier = tier;
    if (eligibility) filter.eligibility = eligibility;

    if (search) {
        filter.name = { $regex: search, $options: "i" };
    }

    return filter;
};

/* ============================
   CREATE PLAN
============================ */
export const createPlan = async (req, res) => {
    try {
        const {
            name,
            price,
            currency = "INR",
            ...rest
        } = req.body;

        if (!name || typeof price !== "number") {
            return res.status(400).json({
                success: false,
                message: "Name and valid price are required",
            });
        }

        const plan = await Plan.create({
            name: name.trim(),
            price,
            currency,
            ...rest,
        });

        return res.status(201).json({
            success: true,
            message: "Plan created successfully",
            data: plan,
        });

    } catch (error) {
        console.error("Create Plan Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

/* ============================
   GET ALL PLANS (Public/Admin)
============================ */
export const getPlans = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            sortBy = "price",
            order = "asc",
            type,
            tier,
            eligibility,
            search,
        } = req.query;

        const filter = buildPlanFilter({ type, tier, eligibility, search });

        const skip = (Number(page) - 1) * Number(limit);
        const sortOrder = order === "desc" ? -1 : 1;

        const [plans, total] = await Promise.all([
            Plan.find(filter)
                .sort({ [sortBy]: sortOrder })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            Plan.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit),
            },
            data: plans,
        });

    } catch (error) {
        console.error("Get Plans Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch plans",
        });
    }
};

/* ============================
   GET PLAN BY ID
============================ */
export const getPlanById = async (req, res) => {
    try {
        const plan = await Plan.findOne({
            _id: req.params.id,
            isActive: true,
        }).lean();

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: plan,
        });

    } catch (error) {
        console.error("Get Plan By ID Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch plan",
        });
    }
};

/* ============================
   SOFT DELETE / DISABLE PLAN
============================ */
export const disablePlan = async (req, res) => {
    try {
        const plan = await Plan.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Plan disabled successfully",
        });

    } catch (error) {
        console.error("Disable Plan Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to disable plan",
        });
    }
};


// PATCH /api/planRoutes/:id
export const updatePlan = async (req, res) => {
    try {
        const allowedFields = [
            "name",
            "description",
            "price",
            "type",
            "tier",
            "eligibility",
            "couponsIncluded",
            "validityDaysCoupons",
            "tags",
            "metadata",
        ];

        const updatePayload = {};
        allowedFields.forEach((f) => {
            if (req.body[f] !== undefined) updatePayload[f] = req.body[f];
        });

        const plan = await Plan.findByIdAndUpdate(
            req.params.id,
            { $set: updatePayload },
            { new: true, runValidators: true }
        );

        if (!plan) {
            return res.status(404).json({ success: false, message: "Plan not found" });
        }

        res.json({ success: true, data: plan });
    } catch (err) {
        res.status(500).json({ success: false, message: "Update failed" });
    }
};
