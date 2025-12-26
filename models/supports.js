import { Schema, model } from 'mongoose';

const messageSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

export default model('Message', messageSchema);