import User from "../models/userModel.js";
import Coupon from "../models/coupunModel.js";
import { Parser } from 'json2csv';


const downloadCoupon = async (req, res) => {
    try {
        // Fetch coupons and populate ownerId and consumersId references
        const coupons = await Coupon.find()
            .populate('ownerId', 'name email') // Populate owner details
            .populate('consumersId', 'name email'); // Populate consumer details

        // Define CSV fields
        const fields = [
            'title',
            'category',
            'discountPercentage',
            'ownerName',
            'ownerEmail',
            'validTill',
            'creationDate',
            'active',
            'maxDistributions',
            'currentDistributions',
            'consumerDetails',
        ];

        // Transform data for CSV
        const couponData = coupons.map(coupon => ({
            title: coupon.title,
            category: coupon.category.join(', '), // Convert array to string
            discountPercentage: `${coupon.discountPercentage}%`,
            ownerName: coupon.ownerId?.name || 'N/A',
            ownerEmail: coupon.ownerId?.email || 'N/A',
            validTill: coupon.validTill.toISOString().split('T')[0], // Format date
            creationDate: coupon.creationDate.toISOString().split('T')[0], // Format date
            active: coupon.active ? 'Yes' : 'No',
            maxDistributions: coupon.maxDistributions || 'Unlimited',
            currentDistributions: coupon.currentDistributions || 0,
            consumerDetails: coupon.consumersId
                .map(consumer => `${consumer.name} (${consumer.email})`)
                .join('; '), // List all consumers
        }));

        // Generate CSV
        const parser = new Parser({ fields });
        const csv = parser.parse(couponData);

        // Set headers and send the file
        res.header('Content-Type', 'text/csv');
        res.attachment('coupons_report.csv');
        res.send(csv);
    } catch (error) {
        console.error('Error generating coupon report:', error);
        res.status(500).send('Error generating coupon report');
    }
}
const downloadUser = async (req, res) => {
    try {
        const users = await User.find().populate('availedCouponsId.couponId');

        // Prepare CSV fields
        const fields = [
            'name',
            'email',
            'phone',
            'type',
            'isVerified',
            'isProfileCompleted',
            'couponCount',
            'availedCoupons', // A custom field we will process below
        ];

        // Transform data for CSV
        const userData = users.map(user => ({
            name: user.name,
            email: user.email,
            phone: user.phone || 'N/A',
            type: user.type,
            isVerified: user.isVerified ? 'Yes' : 'No',
            isProfileCompleted: user.isProfileCompleted ? 'Yes' : 'No',
            couponCount: user.couponCount,
            availedCoupons: user.availedCouponsId
                .map(coupon => `Coupon ID: ${coupon.couponId}, Status: ${coupon.status}, Total Price: ${coupon.totalPrice}`)
                .join('; '),
        }));

        const parser = new Parser({ fields });
        const csv = parser.parse(userData);

        res.header('Content-Type', 'text/csv');
        res.attachment('users_report.csv');
        res.send(csv);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating CSV');
    }
}

const getUserReport = async (req, res) => {
    try {
        const users = await User.find();
        const userData = users.map(user => ({
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone || 'N/A',
            type: user.type,
            isVerified: user.isVerified ? 'Yes' : 'No',
            isProfileCompleted: user.isProfileCompleted ? 'Yes' : 'No',
            couponCount: user.couponCount,
            availedCoupons: user.availedCouponsId
                .map(coupon => `Coupon ID: ${coupon.couponId}, Status: ${coupon.status}, Total Price: ${coupon.totalPrice}`)
                .join('; '),
        }));
        res.json(userData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching user data');
    }
};

const getCouponReport = async (req, res) => {
    try {
        const coupons = await Coupon.find()
            .populate('ownerId', 'name email')
            .populate('consumersId', 'name email');
        const couponsData = coupons.map(coupon => ({
            id: coupon._id,
            title: coupon.title,
            category: coupon.category.join(', '),
            discountPercentage: coupon.discountPercentage,
            owner: {
                name: coupon.ownerId?.name || 'N/A',
                email: coupon.ownerId?.email || 'N/A',
            },
            validTill: coupon.validTill.toISOString().split('T')[0],
            active: coupon.active ? 'Yes' : 'No',
            maxDistributions: coupon.maxDistributions || 'Unlimited',
            currentDistributions: coupon.currentDistributions || 0,
            consumers: coupon.consumersId
                .map(consumer => `${consumer.name} (${consumer.email})`)
                .join(', '),
        }));
        res.json(couponsData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching coupon data');
    }
};

export { downloadCoupon, downloadUser, getUserReport, getCouponReport}