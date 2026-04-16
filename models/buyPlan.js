import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * BuyPlan Schema
 * - Designed for high-scale subscription / plan purchase system
 * - Optimized for querying active plans, payment mapping, and lifecycle tracking
 */
const buyPlanSchema = new Schema(
  {
    /* -------------------- RELATIONS -------------------- */
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    planId: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      required: true
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      unique: true
    },

    /* -------------------- BILLING -------------------- */
    amount: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      default: "INR"
    },

    /* -------------------- STATUS MANAGEMENT -------------------- */
    status: {
      type: String,
      enum: ["pending", "complete", "consumed", "cancelled", "expired"],
      default: "pending",
      index: true
    },

    active: {
      type: Boolean,
      default: true,
      index: true
    },

    /* -------------------- LIFECYCLE -------------------- */
    startDate: {
      type: Date,
      default: Date.now
    },

    expiryDate: {
      type: Date,
      index: true
    },

    consumedAt: {
      type: Date,
      default: null
    },

    cancelledAt: {
      type: Date,
      default: null
    },

    /* -------------------- METADATA -------------------- */
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

/* -------------------- INDEXING (SCALING) -------------------- */

// Fast lookup for user active plans
buyPlanSchema.index({ userId: 1, active: 1 });

// Payment uniqueness + quick lookup
buyPlanSchema.index({ paymentId: 1 });

// Expiry-based queries (cron / background jobs)
buyPlanSchema.index({ expiryDate: 1 });

// Compound for dashboard queries
buyPlanSchema.index({ userId: 1, status: 1, active: 1 });

/* -------------------- HOOKS -------------------- */

// Auto-expire plan
buyPlanSchema.pre("save", function (next) {
  if (this.expiryDate && this.expiryDate < new Date()) {
    this.status = "expired";
    this.active = false;
  }
  next();
});

// Mark consumed
buyPlanSchema.methods.markConsumed = function () {
  this.status = "consumed";
  this.consumedAt = new Date();
  this.active = false;
  return this.save();
};

// Cancel plan
buyPlanSchema.methods.cancelPlan = function () {
  this.status = "cancelled";
  this.cancelledAt = new Date();
  this.active = false;
  return this.save();
};

/* -------------------- STATIC METHODS -------------------- */

// Get active plan (like Netflix subscription check)
buyPlanSchema.statics.getActivePlan = function (userId) {
  return this.findOne({
    userId,
    active: true,
    status: "complete",
    expiryDate: { $gt: new Date() }
  }).lean();
};

// Check if user has valid plan
buyPlanSchema.statics.hasValidPlan = async function (userId) {
  const plan = await this.getActivePlan(userId);
  return !!plan;
};

export default model("BuyPlan", buyPlanSchema);