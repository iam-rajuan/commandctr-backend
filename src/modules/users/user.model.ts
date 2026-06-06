import { model, Schema } from 'mongoose';

import { USER_ROLES, USER_STATUSES } from '@/constants/app.constant';

import { IUser } from './user.interface';

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'user' },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    avatar: { type: String, trim: true },
    phone: { type: String, trim: true },
    lastLoginAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const UserModel = model<IUser>('User', userSchema);
