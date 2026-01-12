import mongoose from 'mongoose';

const adSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,  
        trim: true
    },
    desc: {
        type: String,
        required: true,
        trim: true
    }
}, { timestamps: true }); // Ye createdAt aur updatedAt add karega

// Schema se model create kar rahe hai
const Ad = mongoose.model('Ad', adSchema);

export default Ad;
