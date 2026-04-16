// middlewares/requireActivePlan.js

import { verifyUserFirstPayment } from "../services/subscription.service.js";

export const requireActivePlan = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    const result = await verifyUserFirstPayment(userId);

    if (!result.success) {
      return res.status(403).json({
        success: false,
        message: result.message
      });
    }

    // Attach plan to request (very useful)
    req.activePlan = result.plan;

    next();
  } catch (error) {
    return res.status(500).json({
      message: "Subscription verification failed",
      error: error.message
    });
  }
};