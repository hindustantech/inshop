// middlewares/rawBody.js
export function rawBodyMiddleware(req, res, next) {
  // Apply ONLY to Razorpay webhooks
  if (
    req.originalUrl.includes("/api/wallet/webhook/razorpay") &&
    req.method === "POST"
  ) {
    let data = "";
    req.setEncoding("utf8");

    req.on("data", chunk => {
      data += chunk;
    });

    req.on("end", () => {
      // Save unparsed body string for signature verification
      req.rawBody = data;

      try {
        // Also parse JSON for later use
        req.body = JSON.parse(data || "{}");
      } catch (err) {
        console.error("⚠️ Razorpay Webhook JSON parse error:", err.message);
        req.body = {};
      }

      next();
    });
  } else {
    // Skip for all other routes
    next();
  }
}
