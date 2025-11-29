import mongoose from 'mongoose';

const MallDetailsSchema = new mongoose.Schema({
    details: {
        name: { type: String, trim: true, default: null },
        contact: { type: String, trim: true, default: null },
        website: { type: String, trim: true, default: null },
    },

    mallImage: [{ type: String }],

    location: {
        floor: { type: String, trim: true, default: null },
        address: { type: String, trim: true, default: null }
    },

    rating: {
        average: { type: Number, default: 0, min: 0, max: 5 },
        totalReviews: { type: Number, default: 0 }
    }
}, { _id: false });


const PatnerProfileSchema = new mongoose.Schema({

    logo: { type: String },

    User_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    mallId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Mall",
        default: null,
    },

    email: {
        type: String,
        required: true,
    },

    idType: {
        type: String,
        enum: ["PAN", "GST"],
        default: "PAN",   // ✅ Default selected PAN
        required: true
    },

    idNumber: {
        type: String,
        required: true,
        validate: {
            validator: function (value) {
                const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
                const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

                if (this.idType === "PAN") return panRegex.test(value);
                if (this.idType === "GST") return gstRegex.test(value);

                return false;
            },
            message: function () {
                return this.idType === "PAN"
                    ? "Invalid PAN number format"
                    : "Invalid GST number format";
            }
        }
    },

    firm_name: {
        type: String,
        required: true,
    },

    isIndependent: {
        type: Boolean,
        default: true,
    },

    // Mall details only if mallId exists
    detilsmall: {
        type: MallDetailsSchema,
        default: null
    },

    address: {
        city: { type: String, default: "" },
        state: { type: String, default: "" }
    }

}, { timestamps: true });


// Auto-update logic before save
PatnerProfileSchema.pre("save", function (next) {
    if (this.mallId) {
        this.isIndependent = false;

        // If mallId exists but detilsmall missing → create default
        if (!this.detilsmall) {
            this.detilsmall = {
                details: {
                    name: null,
                    contact: null,
                    website: null,
                },
                logo: [],
                location: {
                    floor: null,
                    address: null,
                },
                rating: {
                    average: 0,
                    totalReviews: 0,
                }
            };
        }

    } else {
        // Not inside a mall
        this.isIndependent = true;
        this.detilsmall = null;
    }

    next();
});


const PatnerProfile = mongoose.model('PatnerProfile', PatnerProfileSchema);
export default PatnerProfile;
