import mongoose from 'mongoose';

const PatnerProfileSchema = new mongoose.Schema({

    logo: {
        type: String,
    },
    User_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        require: true,
    },
    mallId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Mall", // Reference to Mall model
        default: null, // null = independent shop
    },
    email: {
        type: String,
        require: true,
    },
    pan: {
        type: String,
        require: true,
    },
    firm_name: {
        type: String,
        require: true,
    },
    isIndependent: {
        type: Boolean,
        default: true, // true = shop not linked to any mall
    },
    address: {
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        }
    }

}, { timestamps: true });

const PatnerProfile = mongoose.model('PatnerProfile', PatnerProfileSchema);
export default PatnerProfile;
