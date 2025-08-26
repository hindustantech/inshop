import General from '../models/generalModel.js';

const getGeneralInfo = async (req, res) => {
    try {
        // Retrieve the singleton configuration document
        const config = await General.getSingleton();
        
        // Send the configuration data as a response
        res.status(200).json(config);
    } catch (error) {
        console.error('Error fetching general info:', error);
        res.status(500).json({ message: 'Failed to retrieve general information' });
    }
};

export {getGeneralInfo};
