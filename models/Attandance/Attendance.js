// models/Attendance.js

import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({

    /* ===========================
       Organization Mapping
    ============================ */

    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    /* ===========================
       Date & Shift
    ============================ */

    date: {
        type: Date,
        required: true,
        index: true
    },

    shift: {
        name: String,
        startTime: String, // "09:00"
        endTime: String    // "18:00"
    },

    /* ===========================
       Punch Timing
    ============================ */

    punchIn: Date,
    punchOut: Date,

    breaks: [
        {
            start: Date,
            end: Date,
            reason: String
        }
    ],

    /* ===========================
       Work Calculation
    ============================ */

    workSummary: {
        totalMinutes: {
            type: Number,
            default: 0
        },

        overtimeMinutes: {
            type: Number,
            default: 0
        },

        lateMinutes: {
            type: Number,
            default: 0
        },

        earlyLeaveMinutes: {
            type: Number,
            default: 0
        }
    },

    /* ===========================
       Attendance Status
    ============================ */

    status: {
        type: String,
        enum: [
            "present",
            "absent",
            "leave",
            "holiday",
            "half_day",
            "week_off"
        ],
        default: "present"
    },

    /* ===========================
       Location (GeoJSON - REQUIRED)
    ============================ */

    geoLocation: {

        type: {
            type: String,
            enum: ["Point"],
            default: "Point"
        },

        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        },

        accuracy: {
            type: Number // meters
        },

        verified: {
            type: Boolean,
            default: false
        },

        source: {
            type: String,
            enum: ["gps", "network", "manual"],
            default: "gps"
        }

    },

    /* ===========================
       Device Binding
    ============================ */

    deviceInfo: {

        deviceId: {
            type: String,
            index: true
        },

        ip: String,

        platform: {
            type: String,
            enum: ["android", "ios", "web"]
        },

        appVersion: String
    },

    /* ===========================
       Audit & Review
    ============================ */

    remarks: String,

    isAutoMarked: {
        type: Boolean,
        default: false
    },

    isSuspicious: {
        type: Boolean,
        default: false
    }

},
    {
        timestamps: true
    });


/* ===========================
   Indexes (CRITICAL)
=========================== */

// Prevent duplicate attendance
attendanceSchema.index(
    { companyId: 1, employeeId: 1, date: 1 },
    { unique: true }
);

// Geo Spatial Index
attendanceSchema.index({
    geoLocation: "2dsphere"
});

// Device Index (fraud detection)
attendanceSchema.index({
    "deviceInfo.deviceId": 1
});


export default mongoose.model("Attendance", attendanceSchema);
