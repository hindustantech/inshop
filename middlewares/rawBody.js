// middlewares/rawBody.js
export function rawBodyMiddleware(req, res, next) {
  // Apply ONLY to Razorpay webhook route
  if (
    req.originalUrl.includes("/api/wallet/webhook/razorpay") &&
    req.method === "POST"
  ) {
    let data = "";

    // Always read body as UTF-8 text (Razorpay signs UTF-8)
    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      // 🚀 Store raw, untouched body for signature verification
      req.rawBody = data;

      try {
        // Parse JSON safely so controller can access req.body normally
        req.body = JSON.parse(data || "{}");
      } catch (err) {
        console.error("⚠️ Razorpay Webhook JSON parse error:", err.message);
        req.body = {};
      }

      // Optional: log consistency for debugging (remove in production)
      if (req.headers["content-length"]) {
        const len = Buffer.byteLength(data);
        const headerLen = parseInt(req.headers["content-length"], 10);
        if (len !== headerLen) {
          console.warn(
            `⚠️ Raw body size mismatch: read=${len}, header=${headerLen}`
          );
        }
      }

      next();
    });
  } else {
    // Skip for all other routes
    next();
  }
}
