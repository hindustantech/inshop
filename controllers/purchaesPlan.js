import Banner from "../models/Banner.js";
import Plan from "../models/Plan.js";
import Coupon from "../models/coupunModel.js";
import TopUpAttempt from "../models/TopUpAttempt.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import UserPlan from "../models/UserPlan.js";
import PaymentLog from "../models/PaymentLog.js";
/* ============================
    UPDATE PLAN
============================ */

export const getBannerByIdPaymentDetils = async (req, res) => {
    try {
        const { cuponid } = req.params;
        const cupon = await Coupon.findById(cuponid).lean();
        if (!cupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found",
            });
        }

        const PlanDetails = await TopUpAttempt.findOne({ planId: cupon.planId, couponId: cupon._id }).lean();

        const transaction = await Transaction.findOne({ referenceId: PlanDetails._id.toString() }).lean();

            

        return res.status(200).json({
            success: true,
            data: PlanDetails,
        }); 
    }
    catch (error) {
        console.error("Get Coupon By ID Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch coupon",
        });
    }
};