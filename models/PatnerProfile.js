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

    pan: {
        type: String,
        required: true,
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
