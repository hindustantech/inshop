import ManualAddress from "../models/ManualAddress.js";


// Helper function to generate code
const generateUniqueCode = async (city) => {
    const prefix = city.substring(0, 3).toUpperCase(); // e.g., "VAR" from "Varanasi"
    let code;
    let exists = true;

    while (exists) {
        const randomNum = Math.floor(100 + Math.random() * 900); // 3-digit random number
        code = `${prefix}${randomNum}`; // e.g., VAR123

        // check if already exists
        const existing = await ManualAddress.findOne({ uniqueCode: code });
        exists = !!existing;
    }

    return code;
};


// -------------------------------controller Function--------------------------------------


export const createManualAddress = async (req, res) => {
    try {
        const { city, state, country, coordinates } = req.body;

        if (!city || !coordinates || coordinates.length !== 2) {
            return res.status(400).json({
                message: "city and coordinates [lng, lat] are required",
            });
        }

        // Auto-generate unique code
        const uniqueCode = await generateUniqueCode(city);

        const manualAddress = new ManualAddress({
            city,
            uniqueCode,
            state: state || null,
            country: country || "India",
            location: {
                type: "Point",
                coordinates,
            },
        });

        await manualAddress.save();

        res.status(201).json({
            message: "Manual address created successfully",
            manualAddress,
        });
    } catch (error) {
        console.error("Error creating manual address:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};



export const getAllManualAddresses = async (req, res) => {
    try {
        // Get page from query params (default 1)
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;

        // Query with projection + lean + pagination
        const addresses = await ManualAddress.find(
            {},
            { state: 1, city: 1, uniqueCode: 1, country: 1, location: 1, _id: 0 }
        )
            .sort({ state: 1, city: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Total count for pagination metadata
        const total = await ManualAddress.countDocuments();

        if (!addresses || addresses.length === 0) {
            return res.status(404).json({ message: "No manual addresses found" });
        }

        res.status(200).json({
            total,
            page,
            pages: Math.ceil(total / limit),
            count: addresses.length,
            addresses,
        });
    } catch (error) {
        console.error("Error fetching manual addresses:", error);
        res.status(500).json({ message: "Server error", error });
    }
};


