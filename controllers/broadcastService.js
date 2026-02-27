import admin from "../utils/firebaseadmin.js";
import User from "../models/userModel.js";

const messaging = admin.messaging();
const MAX_BATCH = 500;
const MAX_PARALLEL = 2;

export const processBroadcast = async ({
    latitude,
    longitude,
    title,
    body,
    data = {},
}) => {

    let query = {
        // devicetoken: { $exists: true, $nin: ["", null] },
    };

    // If lat/lng provided → 100km radius
    if (latitude && longitude) {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        const radiusKm = 100;
        const earthRadiusKm = 6378.1;
        const radiusInRadians = radiusKm / earthRadiusKm;

        query.latestLocation = {
            $geoWithin: {
                $centerSphere: [[lng, lat], radiusInRadians],
            },
        };
    }

    const cursor = User.find(query)
        .select("devicetoken")
        .lean()
        .cursor();

    let totalUsers = 0;
    let totalSuccess = 0;
    let totalFailure = 0;

    let batch = [];
    let active = [];

    const flush = async () => {
        if (!batch.length) return;

        const tokens = [...batch];
        batch = [];

        const p = messaging
            .sendEachForMulticast({
                topic: "all",
                notification: { title, body },
                data,
                tokens,
            })
            .then((response) => {
                response.responses.forEach((resp) => {
                    if (resp.success) totalSuccess++;
                    else totalFailure++;
                });
            })
            .finally(() => {
                active = active.filter((x) => x !== p);
            });

        active.push(p);

        if (active.length >= MAX_PARALLEL) {
            await Promise.race(active);
        }
    };

    for await (const user of cursor) {
        totalUsers++;
        batch.push(user.devicetoken);

        if (batch.length === MAX_BATCH) {
            await flush();
        }
    }

    if (batch.length) await flush();
    await Promise.all(active);

    return { totalUsers, totalSuccess, totalFailure };
};