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
    email: {
        type: String,
        require: true,
    },
    firm_name: {
        type: String,
        require: true,
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
