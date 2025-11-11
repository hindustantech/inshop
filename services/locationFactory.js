import { UserLocationStrategy, ManualCodeStrategy, CustomLatLngStrategy, DefaultLocationStrategy } from "./locationStrategies.js";

export class LocationStrategyFactory {
    constructor() { this.strategies = []; }
    register(strategy) { this.strategies.push(strategy); }

    async getBaseLocation(req, radius) {
        let lastLocation = null;

        for (const strategy of this.strategies) {
            req.baseLocation = lastLocation?.location || null;
            const result = await strategy.getLocation(req, radius);
            if (result) {
                lastLocation = result; // use last valid location
            }
        }

        return lastLocation;
    }
}

// Register strategies
export const locationFactory = new LocationStrategyFactory();
locationFactory.register(new UserLocationStrategy());
locationFactory.register(new ManualCodeStrategy());
locationFactory.register(new CustomLatLngStrategy());
locationFactory.register(new DefaultLocationStrategy());
