// utils/AppError.js
export class AppError extends Error {
    constructor(message, statusCode = 500, code = "INTERNAL_ERROR", extra = {}) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.extra = extra;
        Error.captureStackTrace?.(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message = "Validation error", extra = {}) {
        super(message, 400, "VALIDATION_ERROR", extra);
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found", extra = {}) {
        super(message, 404, "NOT_FOUND", extra);
    }
}

export class PaymentError extends AppError {
    constructor(message = "Payment error", extra = {}) {
        super(message, 400, "PAYMENT_ERROR", extra);
    }
}
