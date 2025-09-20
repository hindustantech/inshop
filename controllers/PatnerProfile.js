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
        const userId = req.user?._id || req.body.User_id;
        const { email, firm_name, address ,pan} = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: "User ID is required" });
        }

        /** ---------------------------
         * Find or Create Profile
         ---------------------------- */
        let profile = await PatnerProfile.findOne({ User_id: userId }).session(session);

        if (!profile) {
            profile = new PatnerProfile({
                User_id: userId,
                firm_name: firm_name || "New Firm",
                email: email || "",
                pan:pan,
                address: {
                    country: "",
                    state: "",
                    city: "",
                    pincode: "",

                    ...(typeof address === "object" ? address : {})
                }
            });
        }

        /** ---------------------------
         * Logo Upload (if file given)
         ---------------------------- */
        if (req.file?.buffer) {
            const uploaded = await uploadToCloudinary(req.file.buffer, "partners");
            if (!uploaded.secure_url) throw new Error("Failed to upload logo");
            profile.logo = uploaded.secure_url;
        }

        /** ---------------------------
         * Update Basic Fields
         ---------------------------- */
        if (email !== undefined) profile.email = email;
        if (firm_name !== undefined) profile.firm_name = firm_name;
        if (pan !== undefined) profile.pan = pan;

        /** Address (merge object safely) */
        if (address !== undefined) {
            let addressObj = typeof address === "string" ? JSON.parse(address) : address;
            profile.address = {
                
                state: addressObj.state || profile.address?.state || "",
                city: addressObj.city || profile.address?.city || "",
               
            };
        }

        /** ---------------------------
         * Save & Commit
         ---------------------------- */
        await profile.save({ session });
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Partner profile saved successfully",
            data: profile.toObject()
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error in createOrUpdateProfile:", error);
        return res.status(500).json({
            success: false,
            message: "Error saving partner profile",
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

        const profile = await PatnerProfile.findOne({ User_id: userId }).populate(
            "User_id",
            "name phone"
        );

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
