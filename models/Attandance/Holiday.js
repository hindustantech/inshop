// models/Holiday.js

import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },

  type: {
    type: String,
    enum: [
      "national",
      "festival",
      "company",
      "optional",
      "floating"
    ]
  },

  isPaid: {
    type: Boolean,
    default: true
  },

  applicableTo: {
    departments: [String],
    roles: [String]
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }

}, {
  timestamps: true
});

holidaySchema.index(
  { companyId: 1, date: 1 },
  { unique: true }
);

export default mongoose.model("Holiday", holidaySchema);
