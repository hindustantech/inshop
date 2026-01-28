import mongoose from "mongoose";

const corporateRequestSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date,
    required: false
  },
  status: {
    type: String,  
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  additionalDetails: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  }
}, {
  timestamps: true
});

const CorporateRequest = mongoose.model('CorporateRequest', corporateRequestSchema);
export default CorporateRequest;
