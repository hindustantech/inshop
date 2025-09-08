import mongoose from 'mongoose';

const userCouponSchema = new mongoose.Schema({
    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
        required: true

    },
    userId: {

        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['available', 'used', 'transferred', 'cancelled'],
        default: 'available'
    },
    transferredTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'

    },
    transferDate: {
        type: Date

    },
    useDate: { 
        type: Date

     },
    qrCode: { 
        type: String, 
        required: true 
    },
    qrScanDate: { 
        type: Date 
    }
}, { timestamps: true });

const UserCoupon = mongoose.model('UserCoupon', userCouponSchema);
export default UserCoupon;
