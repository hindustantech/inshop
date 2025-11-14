import PatnerProfile from "../models/PatnerProfile.js";
import { uploadToCloudinary } from "../utils/Cloudinary.js";
import mongoose from "mongoose";
// @desc    Create or Update Partner Profile
// @route   POST /api/patner-profile
// @access  Private

export const createOrUpdateProfile = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.user?._id || req.user.id;

        // mallId string / JSON both accepted
        let { email, firm_name, address, pan, mallId, detilsmall } = req.body;

        // Convert mallId safely
        if (typeof mallId === "string" && mallId.trim() === "") {
            mallId = null;
        }

        if (mallId && typeof mallId === "string") {
            try {
                // prevent invalid ObjectId crash
                if (mongoose.Types.ObjectId.isValid(mallId) === false) {
                    mallId = null;
                }
            } catch (e) {
                mallId = null;
            }
        }

        if (!userId) {
            return res.status(400).json({ success: false, message: "User ID is required" });
        }

        // Find profile
        let profile = await PatnerProfile.findOne({ User_id: userId }).session(session);

        if (!profile) {
            profile = new PatnerProfile({
                User_id: userId,
                email: email || "",
                firm_name: firm_name || "New Firm",
                pan: pan || "",
                mallId: mallId || null,
                address: { city: "", state: "" }
            });
        }

        // Logo upload
        if (req.file?.buffer) {
            const uploaded = await uploadToCloudinary(req.file.buffer, "partners");
            if (!uploaded.secure_url) throw new Error("Failed to upload logo");
            profile.logo = uploaded.secure_url;
        }

        // Basic fields
        if (email) profile.email = email;
        if (firm_name) profile.firm_name = firm_name;
        if (pan) profile.pan = pan;

        // ⭐ MALL LOGIC FIX ⭐
        if (mallId) {
            profile.mallId = mallId;
            profile.isIndependent = false;

            if (detilsmall) {
                let mallObj = typeof detilsmall === "string" ? JSON.parse(detilsmall) : detilsmall;
                profile.detilsmall = { ...profile.detilsmall, ...mallObj };
            } else {
                // auto create
                profile.detilsmall ??= {
                    details: { name: null, contact: null, website: null },
                    logo: [],
                    location: { floor: null, address: null },
                    rating: { average: 0, totalReviews: 0 }
                };
            }

        } else {
            // No mall selected
            profile.mallId = null;
            profile.isIndependent = true;
            profile.detilsmall = null;
        }

        // Address
        if (address) {
            let addr = typeof address === "string" ? JSON.parse(address) : address;
            profile.address = {
                city: addr.city || profile.address.city,
                state: addr.state || profile.address.state
            };
        }

        await profile.save({ session });
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Profile saved successfully",
            data: profile.toObject()
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        return res.status(500).json({
            success: false,
            message: "Error saving profile",
            error: error.message
        });
    }
};


// @desc    Get Partner Profile by User
// @route   GET /api/patner-profile/:userId
// @access  Private
export const getProfile = async (req, res) => {
    try {
        const { userId } = req.params;

        const profile = await PatnerProfile.findOne({ User_id: new mongoose.Types.ObjectId(userId) })
            .populate("User_id", "name phone referalCode");

        if (!profile) {
            return res
                .status(404)
                .json({ success: false, message: "Profile not found" });
        }

        res.status(200).json({
            success: true,
            data: profile
        });
    } catch (error) {
        console.error("Error in getProfile:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
