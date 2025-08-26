import Coupon from "../models/coupunModel.js";
import User from "../models/userModel.js";

export const getCoupon = async (req, res) => {
    // return random 6 coupun if > 6 else return available from mongoose
    try {
        const coupons = await Coupon.find({});
        const randomCoupons = coupons.length > 6? coupons.slice(0, 6) : coupons;
        res.json(randomCoupons);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
}


export const getShops = async (req, res) => {
    try {
        // Fetch only required fields
        const users = await User.find(
            { type: "partner" },
            {
                name: 1,
                email: 1,
                "data.shop_name": 1,
                "data.shop_city": 1,
                "data.shop_state": 1
            }
        );

        // Randomly select 3 users if there are more than 3, else return all found
        const randomUsers = users.length > 3 
            ? users.sort(() => 0.5 - Math.random()).slice(0, 3)
            : users;

        res.json(randomUsers);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};
