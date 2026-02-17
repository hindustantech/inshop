import { serialize } from "v8";
import PatnerProfile from "../models/PatnerProfile.js";
import User from "../models/userModel.js";
import { uploadToCloudinary } from "../utils/Cloudinary.js";
import mongoose from "mongoose";


// @desc    Create or Update Partner Profile

// export const createOrUpdateProfile = async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         const userId = req.user?._id || req.user.id;

//         let {
//             name,
//             email,
//             firm_name,
//             address,
//             idType,        // PAN or GST
//             idNumber,      // Actual ID number
//             mallId,
//             detilsmall
//         } = req.body;

//         if (typeof mallId === "string" && mallId.trim() === "") mallId = null;
//         if (mallId && !mongoose.Types.ObjectId.isValid(mallId)) mallId = null;

//         if (!userId) {
//             return res.status(400).json({ success: false, message: "User ID missing" });
//         }

//         if (idNumber === "" || idNumber === undefined) {
//             idNumber = null;
//         }

//         let user = await User.findById(userId).session(session);
//         if (!user) {
//             return res.status(404).json({ success: false, message: "User not found" });
//         }
//         await User.findByIdAndUpdate(
//             userId,
//             { email: email || user.email },
//             { name: name || user.name },
//             { new: true, session }
//         );

//         let profile = await PatnerProfile.findOne({ User_id: userId }).session(session);

//         if (!profile) {
//             profile = new PatnerProfile({
//                 User_id: userId,
//                 email,
//                 firm_name: firm_name || "New Firm",
//                 idType: idType || "PAN",     // Default PAN
//                 idNumber: idNumber ?? null,
//                 mallId: mallId || null,
//                 address: { city: "", state: "" }
//             });
//         }

//         // Upload Logo
//         if (req.files?.logo?.length > 0) {
//             const file = req.files.logo[0];
//             const uploaded = await uploadToCloudinary(file.buffer, "partners");
//             if (!uploaded.secure_url) throw new Error("Logo upload failed");

//             profile.logo = uploaded.secure_url;
//         }

//         // Upload Mall Images
//         let uploadedMallImages = [];

//         if (req.files?.mallImage?.length > 0) {
//             for (const file of req.files.mallImage) {
//                 const uploaded = await uploadToCloudinary(file.buffer, "mall_images");
//                 if (uploaded.secure_url) uploadedMallImages.push(uploaded.secure_url);
//             }
//         }

//         // Basic updates
//         if (email) profile.email = email;
//         if (firm_name) profile.firm_name = firm_name;

//         // 🔥 Correct ID Update According to Schema
//         if (idType) profile.idType = idType;      // Change PAN/GST
//         if ("idNumber" in req.body) {
//             profile.idNumber = idNumber; // string OR null
//         }
//         // Mall Logic
//         if (mallId) {
//             profile.mallId = mallId;
//             profile.isIndependent = false;

//             let mallObj = {};
//             if (detilsmall) {
//                 mallObj = typeof detilsmall === "string" ? JSON.parse(detilsmall) : detilsmall;
//             }

//             if (!profile.detilsmall) {
//                 profile.detilsmall = {
//                     details: { name: null, contact: null, website: null },
//                     mallImage: [],
//                     location: { floor: null, address: null },
//                     rating: { average: 0, totalReviews: 0 }
//                 };
//             }

//             profile.detilsmall = { ...profile.detilsmall, ...mallObj };

//             if (uploadedMallImages.length > 0) {
//                 profile.detilsmall.mallImage.push(...uploadedMallImages);
//             }

//         } else {
//             profile.mallId = null;
//             profile.isIndependent = true;
//             profile.detilsmall = null;
//         }

//         // Address
//         if (address) {
//             let addr = typeof address === "string" ? JSON.parse(address) : address;

//             profile.address = {
//                 city: addr.city || profile.address.city,
//                 state: addr.state || profile.address.state
//             };
//         }

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
        /* ----------------------------------
           1. Get User ID (Auth Middleware)
        ---------------------------------- */
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID missing",
            });
        }

        /* ----------------------------------
           2. Extract Body
        ---------------------------------- */
        let {
            name,
            email,
            firm_name,
            address,
            idType,
            idNumber,
            mallId,
            detilsmall,
        } = req.body;

        /* ----------------------------------
           3. Normalize Inputs
        ---------------------------------- */
        if (typeof mallId === "string" && mallId.trim() === "") mallId = null;

        if (mallId && !mongoose.Types.ObjectId.isValid(mallId)) {
            mallId = null;
        }

        if (idNumber === "" || idNumber === undefined) {
            idNumber = null;
        }

        /* ----------------------------------
           4. Fetch User (Single Read)
        ---------------------------------- */
        const user = await User.findById(userId).session(session);

        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        /* ----------------------------------
           5. Update User Safely
        ---------------------------------- */
        if (email) user.email = email;
        if (name) user.name = name;

        await user.save({ session });

        /* ----------------------------------
           6. Get / Create Partner Profile
        ---------------------------------- */
        let profile = await PatnerProfile.findOne({
            User_id: userId,
        }).session(session);

        if (!profile) {
            profile = new PatnerProfile({
                User_id: userId,
                email: email || user.email,
                firm_name: firm_name || "New Firm",
                idType: idType || "PAN",
                idNumber: idNumber,
                mallId: mallId,
                isIndependent: !mallId,
                address: { city: "", state: "" },
            });
        }

        /* ----------------------------------
           7. Upload Logo
        ---------------------------------- */
        if (req.files?.logo?.length > 0) {
            const file = req.files.logo[0];

            const uploaded = await uploadToCloudinary(
                file.buffer,
                "partners"
            );

            if (!uploaded?.secure_url) {
                throw new Error("Logo upload failed");
            }

            profile.logo = uploaded.secure_url;
        }

        /* ----------------------------------
           8. Upload Mall Images
        ---------------------------------- */
        const uploadedMallImages = [];

        if (req.files?.mallImage?.length > 0) {
            for (const file of req.files.mallImage) {
                const uploaded = await uploadToCloudinary(
                    file.buffer,
                    "mall_images"
                );

                if (uploaded?.secure_url) {
                    uploadedMallImages.push(uploaded.secure_url);
                }
            }
        }

        /* ----------------------------------
           9. Basic Profile Updates
        ---------------------------------- */
        if (email) profile.email = email;
        if (firm_name) profile.firm_name = firm_name;

        if (idType) profile.idType = idType;

        if ("idNumber" in req.body) {
            profile.idNumber = idNumber;
        }

        /* ----------------------------------
           10. Mall Logic
        ---------------------------------- */
        if (mallId) {
            profile.mallId = mallId;
            profile.isIndependent = false;

            let mallObj = {};

            if (detilsmall) {
                mallObj =
                    typeof detilsmall === "string"
                        ? JSON.parse(detilsmall)
                        : detilsmall;
            }

            if (!profile.detilsmall) {
                profile.detilsmall = {
                    details: {
                        name: null,
                        contact: null,
                        website: null,
                    },
                    mallImage: [],
                    location: {
                        floor: null,
                        address: null,
                    },
                    rating: {
                        average: 0,
                        totalReviews: 0,
                    },
                };
            }

            profile.detilsmall = {
                ...profile.detilsmall,
                ...mallObj,
            };

            if (uploadedMallImages.length > 0) {
                profile.detilsmall.mallImage.push(
                    ...uploadedMallImages
                );
            }
        } else {
            profile.mallId = null;
            profile.isIndependent = true;
            profile.detilsmall = null;
        }

        /* ----------------------------------
           11. Address Update
        ---------------------------------- */
        if (address) {
            const addr =
                typeof address === "string"
                    ? JSON.parse(address)
                    : address;

            profile.address = {
                city: addr.city || profile.address?.city,
                state: addr.state || profile.address?.state,
            };
        }

        /* ----------------------------------
           12. Save Profile
        ---------------------------------- */
        await profile.save({ session });

        /* ----------------------------------
           13. Commit Transaction
        ---------------------------------- */
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Profile saved successfully",
            data: profile,
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("Profile Error:", error);

        return res.status(500).json({
            success: false,
            message: "Error saving profile",
            error: error.message,
        });
    }
};

// @desc    Get Partner Profile by User
// @route   GET /api/patner-profile/:userId
// @access  Private
export const getProfile = async (req, res) => {
    try {
        const { userId } = req.params;


        // 1️⃣ Validate ObjectId (important in production)
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid userId",
            });
        }

        // 2️⃣ Fetch base user (only required fields)
        const user = await User.findById(userId)
            .select("name phone type referalCode createdAt")
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // 3️⃣ If NOT partner → return user directly (fast path)
        if (user.type !== "partner") {
            return res.status(200).json({
                success: true,
                data: user,
            });
        }

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
