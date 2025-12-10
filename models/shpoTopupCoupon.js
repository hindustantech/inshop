import mongoose from "mongoose";
const { Schema } = mongoose;

const shpoTopupCouponSchema = new Schema(
  {
    code: { 
      type: String, 
      required: true, 
      unique: true, 
      uppercase: true, 
      trim: true,
      index: true 
    },
    title: { type: String, required: true },
    description: { type: String },
    
    // Discount configuration
    discountType: { 
      type: String, 
      enum: ["flat", "percentage", "bonus"], 
      required: true 
    },
    discountValue: { type: Number, required: true }, // paise or percentage value
    
    // Applicability
    applicablePlans: [{ type: Schema.Types.ObjectId, ref: "Plan" }],
    applicableCategories: [String],
    minPurchaseAmount: { type: Number, default: 0 }, // in paise
    maxDiscountAmount: { type: Number, default: 0 }, // in paise (for percentage discounts)
    bonusAmount: { type: Number, default: 0 }, // optional wallet bonus (paise)
    
    // Validity
    validFrom: { type: Date, default: Date.now },
    validTill: { type: Date, required: true },
    
    // Usage limits
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
    
    // User restrictions
    eligibleUserTypes: { 
      type: [String], 
      enum: ["all", "new_user", "existing_user", "premium", "enterprise"],
      default: ["all"]
    },
    specificUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    
    // Campaign tracking
    campaignName: String,
    campaignId: String,
    
    // Status
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    
    // Metadata
    tags: [String],
    metadata: Schema.Types.Mixed,
    
    // Audit fields
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Instance methods
shpoTopupCouponSchema.methods.isValidForUser = function(userId, userType = "existing_user") {
  const now = new Date();
  
  // Basic validations
  if (!this.isActive || this.isDeleted) return false;
  if (this.validFrom && now < this.validFrom) return false;
  if (now > this.validTill) return false;
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) return false;
  
  // User type validation
  if (!this.eligibleUserTypes.includes("all") && 
      !this.eligibleUserTypes.includes(userType)) {
    return false;
  }
  
  // Specific users validation
  if (this.specificUsers && this.specificUsers.length > 0) {
    if (!this.specificUsers.includes(userId)) return false;
  }
  
  return true;
};

shpoTopupCouponSchema.methods.calculateDiscount = function(amountPaise, planId = null) {
  let discountAmount = 0;
  let bonusCredit = 0;
  
  // Check if shpoTopupCoupon applies to this plan
  if (this.applicablePlans && this.applicablePlans.length > 0) {
    if (planId && !this.applicablePlans.includes(planId)) {
      return { discountAmount: 0, bonusCredit: 0, isValid: false };
    }
  }
  
  // Calculate discount based on type
  switch (this.discountType) {
    case "flat":
      discountAmount = Math.min(this.discountValue, amountPaise);
      break;
      
    case "percentage":
      const percentageDiscount = Math.round((amountPaise * this.discountValue) / 100);
      discountAmount = this.maxDiscountAmount > 0 
        ? Math.min(percentageDiscount, this.maxDiscountAmount)
        : percentageDiscount;
      discountAmount = Math.min(discountAmount, amountPaise);
      break;
      
    case "bonus":
      bonusCredit = this.discountValue;
      break;
  }
  
  // Add bonus if configured
  if (this.bonusAmount > 0) {
    bonusCredit += this.bonusAmount;
  }
  
  return {
    discountAmount,
    bonusCredit,
    isValid: true,
    finalAmount: amountPaise - discountAmount,
    finalCredit: amountPaise + bonusCredit - discountAmount
  };
};

// Static methods
shpoTopupCouponSchema.statics.findByCode = function(code) {
  return this.findOne({ 
    code: code.toUpperCase().trim(),
    isActive: true,
    isDeleted: false
  });
};

// Indexes
shpoTopupCouponSchema.index({ validTill: 1, isActive: 1 });
shpoTopupCouponSchema.index({ campaignName: 1 });
shpoTopupCouponSchema.index({ tags: 1 });

export default mongoose.models.shpoTopupCoupon || mongoose.model("shpoTopupCoupon", shpoTopupCouponSchema);