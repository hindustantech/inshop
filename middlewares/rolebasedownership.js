export const roleBasedOwnership = (req, res, next) => {
    try {
        const { role, _id } = req.user;
        let ownerId = req.body.ownerId;

        if (role === "agency" || role === "superadmin") {
            req.ownership = {
                createdBy: _id,
                ownerId: ownerId ? ownerId : _id, // अगर pass कइल गइल बा तऽ वही ले लो, नइखे तऽ खुद
            };
        }
        else if (role === "partner") {
            req.ownership = {
                createdBy: _id,
                ownerId: _id,
            };
        }
        else {
            return res.status(403).json({ message: "Unauthorized role" });
        }

        next();
    } catch (err) {
        return res.status(500).json({ message: "Role check error", error: err.message });
    }
};
