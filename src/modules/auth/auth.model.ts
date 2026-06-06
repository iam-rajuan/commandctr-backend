import { Schema, model } from 'mongoose';

const authPlaceholderSchema = new Schema(
  {
    provider: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const AuthPlaceholderModel = model('AuthPlaceholder', authPlaceholderSchema);
