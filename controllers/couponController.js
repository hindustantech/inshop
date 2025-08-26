// const Coupon = require('../models/coupunModel');
// const User = require('../models/userModel');
// import Coupon from '../models/coupunModel';
// import { use } from 'passport';
import Coupon from '../models/coupunModel.js';
import User from '../models/userModel.js';

const statesAndUTs = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep',
  'Delhi',
  'Puducherry',
  'Ladakh',
  'Jammu and Kashmir'
];

const create = async (req, res) => {
  try {
    const { title, category, discountPercentage, validTill, style, active, maxDistributions } = req.body;

    // Use the user ID from the token (req.user)
    // console.log(req.user);
    const ownerId = req.user._id;
    // console.log(ownerId);
    const newCoupon = new Coupon({
      title,
      category,
      discountPercentage,
      ownerId, // Assigning the authenticated user as the owner
      validTill,
      style,
      active,
      maxDistributions,
    });

    const saved_newCoupon = await newCoupon.save();

    // console.log(saved_newCoupon);
    const currentUser = await User.findById(ownerId);
    currentUser.createdCouponsId.push(saved_newCoupon._id);
    await currentUser.save();

    res.status(201).json({
      message: 'Coupon created successfully',
      coupon: newCoupon
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error creating coupon',
      error: error.message
    });
  }
};

const getall = async (req, res) => {
  try {
    const city = req.query.city;  // Get the city from the query parameter
    const search = req.query.search; // Get the search text from the query parameter

    let filter = {};

    // If user is authenticated
    if (req.user) {
      // Filter for partner type
      if (req.user.type === 'partner') {
        const couponIdList = req.user.createdCouponsId;
        filter._id = { $in: couponIdList };
      }
    }

    // Apply city filter for both authenticated and non-authenticated requests
    if (city && city !== 'all') {
      const usersInCity = await User.find({ 'data.shop_city': city });
      const userIdsInCity = usersInCity.map(user => user._id);
      filter.ownerId = { $in: userIdsInCity };
    }

    // Add a partial match filter for title if search text is provided
    if (search) {
      filter.title = { $regex: search, $options: 'i' }; // Case-insensitive partial match
    }

    // Only show active coupons for non-authenticated users
    if (!req.user) {
      filter.active = true;
    }

    // Fetch coupons based on filters
    const coupons = await Coupon.find(filter);

    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching coupons',
      error: error.message
    });
  }
};


const getbyid = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the coupon by ID
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.status(200).json(coupon);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching coupon',
      error: error.message
    });
  }
}

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the coupon by ID
    const deletedCoupon = await Coupon.findByIdAndDelete(id);
    console.log(deletedCoupon);
    if (!deletedCoupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.status(200).json({ message: 'Coupon deleted successfully', deletedCoupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error deleting coupon',
      error: error.message
    });
  }
};

const toggleActive = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    coupon.active = !coupon.active;
    await coupon.save();
    res.status(200).json({ message: 'Coupon status toggled successfully', coupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error toggling coupon status',
      error: error.message
    });
  }
}

const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedCoupon = await Coupon.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedCoupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    res.status(200).json({ message: 'Coupon updated successfully', updatedCoupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating coupon',
      error: error.message
    });
  }
}

const availCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    // console.log(id);
    // Find the coupon by the code
    const coupon = await Coupon.findById(id);
    const currentUser = await User.findById(req.user._id);

    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    if (!coupon.active) {
      return res.status(400).json({ message: 'Coupon is inactive' });
    }
    if (coupon.maxDistributions && coupon.currentDistributions >= coupon.maxDistributions) {
      return res.status(400).json({ message: 'Coupon has reached its maximum distribution limit' });
    }

    // Check if the user has already availed the coupon

    if (currentUser.availedCouponsId.includes(coupon._id)) {
      return res.status(400).json({ message: 'You have already availed this coupon' });
    }

    // Increment currentDistributions and add user to consumers list
    coupon.currentDistributions++;
    coupon.consumersId.push(req.user._id);

    // Add coupon ID to the user's availedCouponsId
    currentUser.availedCouponsId.push({ couponId: coupon._id });

    // Save both the coupon and user changes
    await coupon.save();
    await currentUser.save();

    res.status(200).json({ message: 'Coupon availed successfully', coupon });
  } catch (error) {
    res.status(500).json({
      message: 'Error availing coupon',
      error: error.message
    });
  }
};

const updateCouponState = async (req, res) => {
  const { id } = req.params; // Coupon ID from request parameters
  const { partnerId, status } = req.body; // Partner ID and new status from request body
  const userId = req.user._id; // User ID from authenticated user

  // Mapping of numeric status values to string representation
  const statusMapping = {
    1: 'ACTIVE',
    2: 'EXPIRED',
    0: 'REDEEMED',
  };

  try {
    // Find the user by ID
    const user = await User.findById(userId);
    console.log(user)

    // Search for the coupon in availedCouponsId by comparing the _id field
    const availedCoupon = user.availedCouponsId.find(coupon => coupon._id.toString() === id);
    // console.log(id);

    if (!availedCoupon) {
      return res.status(404).json({ message: "Coupon not found in availed coupons" });
    }

    // Check if the provided status is valid and update the coupon's status
    if (status in statusMapping) {
      const coupon = await Coupon.findById(availedCoupon.couponId);
      // console.log(coupon.ownerId.toString());
      // console.log(partnerId);
      if (coupon.ownerId.toString() === partnerId) {
        availedCoupon.status = statusMapping[status];
      } else {
        return res.status(403).json({ message: "Coupon owner does not match the provided partner ID" });
      }
    } else {
      return res.status(400).json({ message: "Invalid status provided" });
    }

    // Save the user document with the updated coupon status
    await user.save();

    // Send success response with the updated coupon
    res.json({ message: "Coupon state updated successfully", coupon: availedCoupon });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAvailedCoupon = async (req, res) => {
  try {
    let data = [];
    if (req.user.availedCouponsId != undefined) {
      for (let availedCoupon of req.user.availedCouponsId) {
        // console.log(availedCoupons.consumerId);
        // console.log(availCoupon)
        const coupon = await Coupon.findById(availedCoupon.couponId);
        // console.log(availedCoupon, coupon);
        console.log(coupon);
        data.push({
          ...coupon._doc, ...availedCoupon._doc
        });
        // console.log({
        //    ...availedCoupon._doc, ...coupon._doc
        // });
      }

      res.json(data);
    } else {
      res.status(404).json({ message: 'No availed coupons found' });
    }

  } catch (error) {
    console.error("Error fetching availed coupons:", error);
    res.status(500).json({ message: 'Failed to fetch availed coupons' });
  }
};

const updateAmount = async (req, res) => {
  try {
    const { id } = req.params; // id of the coupon to update
    const { consumerId, amount } = req.body; // consumerId and the new amount (totalprize)

    // Find the user by consumerId
    const user = await User.findById(consumerId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the correct availed coupon by matching the id with _id
    const availedCoupon = user.availedCouponsId.find(coupon => coupon._id.toString() === id);

    if (!availedCoupon) {
      return res.status(404).json({ message: 'Coupon not found in user\'s availed coupons' });
    }

    // Update the totalprize field of the matched coupon
    availedCoupon.totalPrice = amount;

    // Save the updated user document
    await user.save();

    res.status(200).json({ message: 'Coupon amount updated successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating coupon amount',
      error: error.message
    });
  }
}

const storeUsedCoupon = async (req, res) => {
  try {
    let response = [];

    for (let couponId of req.user.createdCouponsId) {
      // console.log(couponId);
      const coupon = await Coupon.findById(couponId);
      // console.log(coupon);

      for (let consumerId of coupon.consumersId) {
        const consumer = await User.findById(consumerId);
        console.log(consumer);

        // Filter consumer's availed coupons based on couponId
        const usedCoupon = consumer.availedCouponsId.filter((singleconsumer) => {
          // console.log(singleconsumer.consumerId, couponId);
          return singleconsumer.couponId.equals(couponId);
        });

        if (usedCoupon.length > 0) {
          response.push({
            consumerData: {
              id: consumer._id,
              ...consumer.data
            },
            couponDetail: usedCoupon
          });
        }
      }
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      message: 'Error storing used coupon',
      error: error.message
    });
  }
}

const transferCoupon = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { reciverId, transferCount } = req.body;

    // Fetch the sender and receiver by their IDs
    const sender = await User.findById(senderId);
    const reciver = await User.findById(reciverId);

    // Ensure sender has enough coupons and prevent couponCount from going below 1
    if (sender.couponCount < transferCount + 1) {
      return res.status(400).json({ message: 'Insufficient coupons to transfer' });
    }

    // Update coupon counts
    sender.couponCount -= transferCount;
    reciver.couponCount += transferCount;

    // Save the updated users
    await sender.save();
    await reciver.save();

    res.status(200).json({ message: 'Coupon(s) transferred successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error transferring coupons', error });
  }
};

const transferCouponByPhone = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { phoneNumber, transferCount } = req.body;
    // Fetch the sender and receiver by their IDs
    const sender = await User.findById(senderId);
    // const reciver = await User.findOne({phone: phoneNumber}); 
    const reciver = await User.findOne({ "data.phonenumber": phoneNumber });
    console.log("sender: ", sender);
    console.log("receiver: ", reciver);

    // Ensure sender has enough coupons and prevent couponCount from going below 1
    if (!reciver) {
      return res.status(404).json({ message: 'User not found with the given phone number' });
    }

    if (sender.couponCount < transferCount + 1) {
      return res.status(400).json({ message: 'Insufficient coupons to transfer' });
    }

    // Update coupon counts
    sender.couponCount -= transferCount;
    reciver.couponCount += transferCount;

    // Save the updated users
    await sender.save();
    await reciver.save();

    res.status(200).json({ message: 'Coupon(s) transferred successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Error transferring coupons', error });
  }
}

const getAllCities = async (req, res) => {
  try {
    const { state } = req.body;

    // Create the base query with partner type and non-empty createdCouponsId
    const query = {
      type: "partner",
      createdCouponsId: { $exists: true, $ne: [] }
    };

    // If a state is specified, add it to the query
    if (state) {
      query["data.shop_state"] = state;
    }

    // Fetch users based on the query
    const users = await User.find(query);

    // Extract unique cities
    const cities = new Set();
    users.forEach(user => {
      if (user.data && user.data.shop_city) {
        cities.add(user.data.shop_city);
      }
    });

    // Send back the unique cities as an array
    res.status(200).json({ cities: Array.from(cities) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cities', error });
  }
};

const getCouponCount = async (req, res) => {
  try {
    // Get the user from the request (set by auth middleware)
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Return the coupon count
    res.status(200).json({ 
      couponCount: user.couponCount,
      message: 'Coupon count retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching coupon count',
      error: error.message
    });
  }
};

export { create, getall, deleteCoupon, getbyid, toggleActive, updateCoupon, availCoupon, updateCouponState, getAvailedCoupon, updateAmount, storeUsedCoupon, transferCoupon, transferCouponByPhone, getAllCities, getCouponCount };
