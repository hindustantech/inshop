import mongoose from 'mongoose';

const generalSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        default: 'Default Address', // Provide a default value for required field
    },
});

// This function ensures only one document exists
generalSchema.statics.getSingleton = async function() {
    const config = await this.findOneAndUpdate(
        {}, // No specific filter
        {}, // No updates, just check existence
        { upsert: true, new: true, setDefaultsOnInsert: true } // Options to create if not exists
    );
    return config;
};

const General = mongoose.model('General', generalSchema);
export default General;
