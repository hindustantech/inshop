// middleware/rawBody.js
export function rawBodyMiddleware(req, res, next) {
    // Only apply for Razorpay webhook route or JSON content-type
    if (
        req.originalUrl.includes("/api/payment/webhook") &&
        req.headers["content-type"] === "application/json"
    ) {
        let data = "";

        req.setEncoding("utf8");

        req.on("data", chunk => {
            data += chunk;
        });

        req.on("end", () => {
            req.rawBody = data;

            try {
                req.body = JSON.parse(data || "{}");
            } catch (err) {
                console.error("⚠️ Webhook JSON parse error:", err.message);
                req.body = {};
            }

            next();
        });
    } else {
        // For all other routes, skip this (important!)
        next();
    }
}

