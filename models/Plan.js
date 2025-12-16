// models/Plan.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const planSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        description: { type: String },
        type: {
            type: String,
            enum: ["one_time", "recurring", "promo", "enterprise", "coupon", "banner"],
            default: "one_time",
        },
        price: {
            type: Number,
            required: true
        }, // amount user pays (paise)
        currency: {
            type: String,
            default: "INR"
        },
        isActive: {
            type: Boolean,
            default: true
        },
        
        // Number of coupons user can create with this plan
        couponsIncluded: {
            type: Number,
            default: 0,
            min: 0
        },
        
        // Validity period in days (0 = lifetime/unlimited)
        validityDays: {
            type: Number,
            default: 0, // 0 means lifetime validity
            min: 0
        },
        
        // Specific dates for time-bound plans
        validFrom: Date,
        validTill: Date,
        
        // Validity period type (optional, for display purposes)
        validityType: {
            type: String,
            enum: ["days", "months", "years", "lifetime"],
            default: "days"
        },
        
        eligibility: {
            type: String,
            enum: ["all", "new_user", "enterprise", "premium"],
            default: "all",
        },
        tier: {
            type: String,
            enum: ["basic", "gold", "platinum", "enterprise", "free"],
            default: "basic"
        },
        tags: [String],
        metadata: Schema.Types.Mixed,
    },
    { timestamps: true }
);

planSchema.index({ isActive: 1, type: 1, validTill: 1 });
planSchema.index({ validityDays: 1 });
planSchema.index({ couponsIncluded: 1 });

// Virtual for formatted validity display
planSchema.virtual('formattedValidity').get(function() {
    if (this.validityDays === 0) return 'Lifetime';
    
    if (this.validityDays < 30) {
        return `${this.validityDays} day${this.validityDays > 1 ? 's' : ''}`;
    } else if (this.validityDays < 365) {
        const months = Math.floor(this.validityDays / 30);
        return `${months} month${months > 1 ? 's' : ''}`;
    } else {
        const years = Math.floor(this.validityDays / 365);
        return `${years} year${years > 1 ? 's' : ''}`;
    }
});

// Method to calculate expiry date
planSchema.methods.calculateExpiry = function(fromDate = new Date()) {
    if (this.validityDays === 0) return null; // Never expires
    
    const expiryDate = new Date(fromDate);
    expiryDate.setDate(expiryDate.getDate() + this.validityDays);
    return expiryDate;
};

export default mongoose.models.Plan || mongoose.model("Plan", planSchema);