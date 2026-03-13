import mongoose from "mongoose";

const { Schema } = mongoose;

const shopVisitSchema = new Schema(
{
    visitDate: {
        type: Date,
        required: true,
        index: true
    },

    shopName: {
        type: String,
        required: true,
        trim: true
    },

    shopAddress: {
        type: String,
        required: true
    },

    area: {
        type: String,
        required: true,
        index: true
    },

    phoneNumber: {
        type: String,
        required: true,
        match: /^[6-9]\d{9}$/
    },

    category: {
        type: String,
        enum: [
            "restaurant",
            "salon",
            "grocery",
            "electronics",
            "fashion",
            "pharmacy",
            "other"
        ],
        required: true
    },

    convertedToBusiness: {
        type: Boolean,
        default: false
    },

    couponId: {
        type: Schema.Types.ObjectId,
        ref: "Coupon"
    },

    bannerId: {
        type: Schema.Types.ObjectId,
        ref: "Banner"
    },

    attendanceId: {
        type: Schema.Types.ObjectId,
        ref: "Attendance"
    },

    visitedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    revenueGenerated: {
        type: Number,
        default: 0
    }

},
{
    timestamps: true
}
);


shopVisitSchema.pre("save", function(next){

    if(this.convertedToBusiness){

        if(!this.couponId && !this.bannerId && !this.attendanceId){

            return next(
                new Error("Conversion source required (couponId/bannerId/attendanceId)")
            )

        }

    }

    next()

})

export default mongoose.model("ShopVisit", shopVisitSchema)