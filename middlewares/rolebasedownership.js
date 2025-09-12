export const roleBasedOwnership = (req, res, next) => {
    try {
        if (!req.user) {
            return res
                .status(401)
                .json({ message: "Unauthorized: User not found" });
        }

        const { type, _id } = req.user; // 👈 "type" hai schema me
        let ownerId = req.body.ownerId;

        if (type === "agency" || type === "super_admin") {
            req.ownership = {
                createdBy: _id,
                ownerId: ownerId ? ownerId : _id,
            };
        } else if (type === "partner") {
            req.ownership = {
                createdBy: _id,
                ownerId: _id,
                partnerId: _id,
            };
        } else {
            return res.status(403).json({ message: "Unauthorized role" });
        }

        next();
    } catch (err) {
        return res.status(500).json({
            message: "Role check error",
            error: err.message,
        });
    }
};
