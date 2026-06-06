import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';

import { env } from '@/config/env';
import { httpStatus } from '@/constants/http.constant';
import { syncLogService } from '@/modules/sync/sync-log.service';
import { IUserSafe } from '@/modules/users/user.interface';
import { UserModel } from '@/modules/users/user.model';
import { userService } from '@/modules/users/user.service';
import { ApiError } from '@/shared/api-error';

import { AuthResponse, AuthTokens, JwtPayload } from './auth.interface';

const signToken = (payload: JwtPayload, secret: string, expiresIn: string): string =>
  jwt.sign(payload, secret, { expiresIn } as SignOptions);

const generateTokens = (payload: JwtPayload): AuthTokens => ({
  accessToken: signToken(payload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRES_IN),
  refreshToken: signToken(payload, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRES_IN)
});

const createPayload = (user: IUserSafe): JwtPayload => ({
  userId: user.id,
  email: user.email,
  role: user.role
});

export const authService = {
  async register(payload: { firstName: string; lastName: string; email: string; password: string }): Promise<AuthResponse> {
    const existingUser = await UserModel.findOne({ email: payload.email.toLowerCase() });
    if (existingUser) {
      throw new ApiError(httpStatus.CONFLICT, 'User already exists with this email');
    }

    const password = await bcrypt.hash(payload.password, 10);
    const user = await UserModel.create({
      ...payload,
      email: payload.email.toLowerCase(),
      password
    });

    const safeUser = userService.toSafeUser(user);
    const tokens = generateTokens(createPayload(safeUser));

    await syncLogService.create({
      userId: user._id.toString(),
      entityType: 'auth',
      entityId: user._id.toString(),
      action: 'register',
      status: 'success',
      message: 'User registered successfully'
    });

    return { user: safeUser, ...tokens };
  },

  async login(payload: { email: string; password: string }): Promise<AuthResponse> {
    const user = await UserModel.findOne({ email: payload.email.toLowerCase() }).select('+password');
    if (!user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or password');
    }

    const isMatch = await bcrypt.compare(payload.password, user.password);
    if (!isMatch) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or password');
    }

    if (user.status === 'blocked') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Your account is blocked');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const safeUser = userService.toSafeUser(user);
    const tokens = generateTokens(createPayload(safeUser));

    await syncLogService.create({
      userId: user._id.toString(),
      entityType: 'auth',
      entityId: user._id.toString(),
      action: 'login',
      status: 'success',
      message: 'User logged in successfully'
    });

    return { user: safeUser, ...tokens };
  },

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
      const user = await UserModel.findById(payload.userId);
      if (!user || user.status === 'blocked') {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid refresh token');
      }

      const safeUser = userService.toSafeUser(user);
      return {
        accessToken: signToken(createPayload(safeUser), env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRES_IN)
      };
    } catch {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid refresh token');
    }
  },

  async getMe(userId: string): Promise<IUserSafe> {
    return userService.getById(userId);
  }
};
