// models/Plan.js
import mongoose from "mongoose";

const planSchema = new mongoose.Schema({
    code: { type: String, unique: true }, // FREE, STARTER, BUSINESS

    name: String,

    price: Number, // INR

    currency: { type: String, default: "INR" },

    billingCycle: {
        type: String,
        enum: ["lifetime", "monthly", "quarterly", "yearly"]
    },

    limits: {
        maxEmployees: Number,
        maxAttendancePerMonth: Number
    },

    features: {
        payroll: Boolean,
        geoFencing: Boolean,
        apiAccess: Boolean,
        reports: Boolean
    },

    razorpayPlanId: String 

}, { timestamps: true });

export default mongoose.model("Plan", planSchema);
