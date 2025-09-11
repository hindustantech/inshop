import ManualAddress from "../models/ManualAddress.js";



export const createManualAddress = async (req, res) => {
    try {
        const { city, state, country, coordinates } = req.body;

        if (!city || !coordinates || coordinates.length !== 2) {
            return res.status(400).json({
                message: "city and coordinates [lng, lat] are required",
            });
        }

        // Auto-generate unique code
        const uniqueCode = await generateUniqueCode(city, state);

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
            manualAddress: {
                uniqueCode: manualAddress.uniqueCode,
                state: manualAddress.state,
                country: manualAddress.country,
                city: manualAddress.city,
                location: manualAddress.location,
                createdAt: manualAddress.createdAt.toISOString().split('T')[0],
            },
        });
    } catch (error) {
        console.error("Error creating manual address:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getAllManualAddresses = async (req, res) => {
    try {
        // Get page and limit from query params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // Query with projection + lean + pagination
        const addresses = await ManualAddress.find(
            { isActive: true },
            { state: 1, city: 1, uniqueCode: 1, country: 1, location: 1, createdAt: 1, _id: 0 }
        )
            .sort({ state: 1, city: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Total count for pagination metadata
        const total = await ManualAddress.countDocuments({ isActive: true });

        if (!addresses || addresses.length === 0) {
            return res.status(404).json({ message: "No manual addresses found" });
        }

        // Map createdAt to date string
        const formattedAddresses = addresses.map(addr => ({
            ...addr,
            createdAt: addr.createdAt.toISOString().split('T')[0],
        }));

        res.status(200).json({
            total,
            page,
            pages: Math.ceil(total / limit),
            count: formattedAddresses.length,
            addresses: formattedAddresses,
        });
    } catch (error) {
        console.error("Error fetching manual addresses:", error);
        res.status(500).json({ message: "Server error", error });
    }
};

export const getManualAddressByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const address = await ManualAddress.findOne(
      { uniqueCode: code },
      { state: 1, city: 1, uniqueCode: 1, country: 1, location: 1, createdAt: 1, isActive: 1, _id: 0 }
    ).lean();

    if (!address) {
      return res.status(404).json({ message: "Manual address not found" });
    }

    // Format createdAt
    address.createdAt = address.createdAt.toISOString().split('T')[0];

    res.status(200).json(address);
  } catch (error) {
    console.error("Error fetching manual address:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateManualAddress = async (req, res) => {
  try {
    const { code } = req.params;
    const { city, state, country, coordinates } = req.body;

    const updated = await ManualAddress.findOneAndUpdate(
      { uniqueCode: code },
      {
        ...(city && { city }),
        ...(state && { state }),
        ...(country && { country }),
        ...(coordinates && { location: { type: "Point", coordinates } }),
      },
      { new: true, runValidators: true, projection: { state: 1, city: 1, uniqueCode: 1, country: 1, location: 1, createdAt: 1, _id: 0 } }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Manual address not found" });
    }

    // Format createdAt
    updated.createdAt = updated.createdAt.toISOString().split('T')[0];

    res.status(200).json({
      message: "Manual address updated successfully",
      updated,
    });
  } catch (error) {
    console.error("Error updating manual address:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deactivateManualAddress = async (req, res) => {
  try {
    const { code } = req.params;

    const updated = await ManualAddress.findOneAndUpdate(
      { uniqueCode: code },
      { isActive: false },
      { new: true, projection: { state: 1, city: 1, uniqueCode: 1, country: 1, location: 1, createdAt: 1, isActive: 1, _id: 0 } }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Manual address not found" });
    }

    // Format createdAt
    updated.createdAt = updated.createdAt.toISOString().split('T')[0];

    res.status(200).json({
      message: "Manual address deactivated successfully",
      updated,
    });
  } catch (error) {
    console.error("Error deactivating manual address:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const generateUniqueCode = async (city, state) => {
    const countryPrefix = 'IND';
    const stateCode = state ? state.substring(0, 2).toUpperCase() : 'XX';
    const cityCode = city.substring(0, 3).toUpperCase();
    let num = 1;
    let code;
    let exists = true;

    while (exists) {
        code = `${countryPrefix}-${stateCode}-${cityCode}-${num.toString().padStart(3, '0')}`;
        const existing = await ManualAddress.findOne({ uniqueCode: code });
        exists = !!existing;
        if (exists) num++;
    }

    return code;
};
