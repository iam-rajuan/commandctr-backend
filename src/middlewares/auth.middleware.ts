import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import { httpStatus } from '@/constants/http.constant';
import { JwtPayload } from '@/modules/auth/auth.interface';
import { UserModel } from '@/modules/users/user.model';
import { ApiError } from '@/shared/api-error';
import { asyncHandler } from '@/shared/async-handler';

export const authMiddleware = asyncHandler(async (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authorization token is required');
  }

  const token = authorization.split(' ')[1];
  if (!token) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authorization token is required');
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtPayload;
    const user = await UserModel.findById(payload.userId);

    if (!user) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found for this token');
    }

    if (user.status === 'blocked') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Your account is blocked');
    }

    req.user = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired access token');
  }
});
