import User from "../models/userModel.js";
import ManualAddress from "../models/ManualAddress.js";
import mongoose from "mongoose";

const MAX_RADIUS = 1000; // 100 km

export class BaseLocationStrategy {
    async getLocation(req, radius) { throw new Error("getLocation() must be implemented."); }
}

export class UserLocationStrategy extends BaseLocationStrategy {
    async getLocation(req, radius) {
        if (!req.user?.id || !mongoose.isValidObjectId(req.user.id)) return null;
        const user = await User.findById(req.user.id).select("latestLocation");
        if (user?.latestLocation?.coordinates?.length === 2 &&
            (user.latestLocation.coordinates[0] !== 0 || user.latestLocation.coordinates[1] !== 0)) {
            return { location: user.latestLocation, mode: "user", effectiveRadius: Math.min(radius, MAX_RADIUS) };
        }
        return null;
    }
}

export class ManualCodeStrategy extends BaseLocationStrategy {
    async getLocation(req, radius) {
        const { manualCode } = req.query;
        if (!manualCode) return null;

        const manual = await ManualAddress.findOne({ uniqueCode: manualCode }).select("location");
        if (!manual?.location?.coordinates?.length) return null;

        const baseLocation = req.baseLocation;
        if (baseLocation) {
            const check = await ManualAddress.aggregate([
                { $geoNear: { near: baseLocation, distanceField: "distance", spherical: true, query: { uniqueCode: manualCode } } },
                { $project: { distance: 1 } }
            ]);
            const distance = check[0]?.distance || 0;
            if (distance > MAX_RADIUS) {
                return { location: manual.location, mode: "manual", effectiveRadius: Math.min(radius, MAX_RADIUS) };
            }
            return null; // within 100 km, keep current base location
        }

        return { location: manual.location, mode: "manual", effectiveRadius: Math.min(radius, MAX_RADIUS) };
    }
}

export class CustomLatLngStrategy extends BaseLocationStrategy {
    async getLocation(req, radius) {
        const { lat, lng } = req.query;
        if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) return null;
        return { location: { type: "Point", coordinates: [Number(lng), Number(lat)] }, mode: "custom", effectiveRadius: Math.min(radius, MAX_RADIUS) };
    }
}

export class DefaultLocationStrategy extends BaseLocationStrategy {
    async getLocation(req, radius) {
        return { location: { type: "Point", coordinates: [78.9629, 20.5937] }, mode: "default", effectiveRadius: null };
    }
}
