// middleware/errorHandler.js
import { AppError } from "../utils/AppError.js";

export function errorHandler(err, req, res, next) {
    console.error("❌ ERROR:", {
        message: err.message,
        code: err.code,
        stack: err.stack,
        extra: err.extra,
        path: req.path,
    });

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            code: err.code,
            message: err.message,
            ...(err.extra ? { extra: err.extra } : {}),
        });
    }

    return res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
    });
}
