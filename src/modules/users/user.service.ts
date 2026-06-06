import bcrypt from 'bcryptjs';

import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { IUserSafe } from './user.interface';
import { UserModel } from './user.model';

const toSafeUser = (user: {
  _id: { toString(): string };
  firstName: string;
  lastName: string;
  email: string;
  role: 'user' | 'admin' | 'super_admin';
  status: 'active' | 'blocked';
  avatar?: string;
  phone?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}): IUserSafe => ({
  id: user._id.toString(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  status: user.status,
  avatar: user.avatar,
  phone: user.phone,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export const userService = {
  toSafeUser,

  async getById(userId: string): Promise<IUserSafe> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    return toSafeUser(user);
  },

  async getProfile(userId: string): Promise<IUserSafe> {
    return this.getById(userId);
  },

  async updateProfile(userId: string, payload: Partial<IUserSafe>): Promise<IUserSafe> {
    const user = await UserModel.findByIdAndUpdate(userId, { $set: payload }, { new: true, runValidators: true });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    return toSafeUser(user);
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await UserModel.findById(userId).select('+password');
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Current password is incorrect');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
  },

  async getAll() {
    const users = await UserModel.find().sort({ createdAt: -1 });
    return users.map((user) => toSafeUser(user));
  },

  async deleteUser(userId: string): Promise<void> {
    const deletedUser = await UserModel.findByIdAndDelete(userId);
    if (!deletedUser) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
  },

  async updateStatus(userId: string, status: 'active' | 'blocked') {
    const user = await UserModel.findByIdAndUpdate(userId, { $set: { status } }, { new: true });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    return toSafeUser(user);
  }
};
