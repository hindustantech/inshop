// middleware/rawBody.js
export function rawBodyMiddleware(req, res, next) {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
        data += chunk;
    });
    req.on("end", () => {
        req.rawBody = data;
        try {
            req.body = JSON.parse(data || "{}");
        } catch {
            req.body = {};
        }
        next();
    });
}
