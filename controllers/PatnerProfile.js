import PatnerProfile from "../models/PatnerProfile.js";
import { uploadToCloudinary } from "../utils/Cloudinary.js";
import mongoose from "mongoose";
// @desc    Create or Update Partner Profile
// @route   POST /api/patner-profile
// @access  Private

// export const createOrUpdateProfile = async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         const userId = req.user?._id || req.user.id;

//         let { email, firm_name, address, pan, mallId, detilsmall } = req.body;

//         // Clean mallId
//         if (typeof mallId === "string" && mallId.trim() === "") mallId = null;
//         if (mallId && !mongoose.Types.ObjectId.isValid(mallId)) mallId = null;

//         if (!userId) {
//             return res.status(400).json({ success: false, message: "User ID missing" });
//         }

//         // Find Partner Profile
//         let profile = await PatnerProfile.findOne({ User_id: userId }).session(session);

//         if (!profile) {
//             profile = new PatnerProfile({
//                 User_id: userId,
//                 email,
//                 firm_name: firm_name || "New Firm",
//                 pan,
//                 mallId: mallId || null,
//                 address: { city: "", state: "" }
//             });
//         }

//         /*
//         -------------------------------------------------------
//         1️⃣ UPLOAD LOGO (single)
//         -------------------------------------------------------
//         */
//         if (req.files?.logo?.length > 0) {
//             const file = req.files.logo[0];
//             const uploaded = await uploadToCloudinary(file.buffer, "partners");

//             if (!uploaded.secure_url) throw new Error("Logo upload failed");

//             profile.logo = uploaded.secure_url;
//         }

//         /*
//         -------------------------------------------------------
//         2️⃣ UPLOAD MALL IMAGES (multiple)
//         -------------------------------------------------------
//         */
//         let uploadedMallImages = [];

//         if (req.files?.mallImage?.length > 0) {
//             for (const file of req.files.mallImage) {
//                 const uploaded = await uploadToCloudinary(file.buffer, "mall_images");
//                 if (uploaded.secure_url) {
//                     uploadedMallImages.push(uploaded.secure_url);
//                 }
//             }
//         }

//         /*
//         -------------------------------------------------------
//         3️⃣ Basic Fields Update
//         -------------------------------------------------------
//         */
//         if (email) profile.email = email;
//         if (firm_name) profile.firm_name = firm_name;
//         if (pan) profile.pan = pan;

//         /*
//         -------------------------------------------------------
//         4️⃣ MALL LOGIC
//         -------------------------------------------------------
//         */
//         if (mallId) {
//             profile.mallId = mallId;
//             profile.isIndependent = false;

//             // Parse detilsmall
//             let mallObj = {};
//             if (detilsmall) {
//                 mallObj = typeof detilsmall === "string" ? JSON.parse(detilsmall) : detilsmall;
//             }

//             // If no detilsmall exists → create fresh
//             if (!profile.detilsmall) {
//                 profile.detilsmall = {
//                     details: { name: null, contact: null, website: null },
//                     mallImage: [],
//                     location: { floor: null, address: null },
//                     rating: { average: 0, totalReviews: 0 }
//                 };
//             }

//             // Merge incoming data
//             profile.detilsmall = { ...profile.detilsmall, ...mallObj };

//             // Push uploaded images to mallImage array
//             if (uploadedMallImages.length > 0) {
//                 profile.detilsmall.mallImage.push(...uploadedMallImages);
//             }

//         } else {
//             // No mall selected → independent
//             profile.mallId = null;
//             profile.isIndependent = true;
//             profile.detilsmall = null;
//         }

//         /*
//         -------------------------------------------------------
//         5️⃣ Address Update
//         -------------------------------------------------------
//         */
//         if (address) {
//             let addr = typeof address === "string" ? JSON.parse(address) : address;

//             profile.address = {
//                 city: addr.city || profile.address.city,
//                 state: addr.state || profile.address.state
//             };
//         }

//         /*
//         -------------------------------------------------------
//         SAVE + COMMIT
//         -------------------------------------------------------
//         */
//         await profile.save({ session });
//         await session.commitTransaction();
//         session.endSession();

//         return res.status(200).json({
//             success: true,
//             message: "Profile saved successfully",
//             data: profile
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(500).json({
//             success: false,
//             message: "Error saving profile",
//             error: error.message
//         });
//     }
// };


export const createOrUpdateProfile = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.user?._id || req.user.id;

        let {
            email,
            firm_name,
            address,
            idType,        // PAN or GST
            idNumber,      // Actual ID number
            mallId,
            detilsmall
        } = req.body;

        if (typeof mallId === "string" && mallId.trim() === "") mallId = null;
        if (mallId && !mongoose.Types.ObjectId.isValid(mallId)) mallId = null;

        if (!userId) {
            return res.status(400).json({ success: false, message: "User ID missing" });
        }

        let profile = await PatnerProfile.findOne({ User_id: userId }).session(session);

        if (!profile) {
            profile = new PatnerProfile({
                User_id: userId,
                email,
                firm_name: firm_name || "New Firm",
                idType: idType || "PAN",     // Default PAN
                idNumber,
                mallId: mallId || null,
                address: { city: "", state: "" }
            });
        }

        // Upload Logo
        if (req.files?.logo?.length > 0) {
            const file = req.files.logo[0];
            const uploaded = await uploadToCloudinary(file.buffer, "partners");
            if (!uploaded.secure_url) throw new Error("Logo upload failed");

            profile.logo = uploaded.secure_url;
        }

        // Upload Mall Images
        let uploadedMallImages = [];

        if (req.files?.mallImage?.length > 0) {
            for (const file of req.files.mallImage) {
                const uploaded = await uploadToCloudinary(file.buffer, "mall_images");
                if (uploaded.secure_url) uploadedMallImages.push(uploaded.secure_url);
            }
        }

        // Basic updates
        if (email) profile.email = email;
        if (firm_name) profile.firm_name = firm_name;

        // 🔥 Correct ID Update According to Schema
        if (idType) profile.idType = idType;      // Change PAN/GST
        if (idNumber) profile.idNumber = idNumber; // Validate via Schema regex

        // Mall Logic
        if (mallId) {
            profile.mallId = mallId;
            profile.isIndependent = false;

            let mallObj = {};
            if (detilsmall) {
                mallObj = typeof detilsmall === "string" ? JSON.parse(detilsmall) : detilsmall;
            }

            if (!profile.detilsmall) {
                profile.detilsmall = {
                    details: { name: null, contact: null, website: null },
                    mallImage: [],
                    location: { floor: null, address: null },
                    rating: { average: 0, totalReviews: 0 }
                };
            }

            profile.detilsmall = { ...profile.detilsmall, ...mallObj };

            if (uploadedMallImages.length > 0) {
                profile.detilsmall.mallImage.push(...uploadedMallImages);
            }

        } else {
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
            data: profile
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
