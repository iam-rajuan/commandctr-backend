import { RequestHandler } from 'express';

import { httpStatus } from '@/constants/http.constant';
import { UserRole } from '@/modules/users/user.interface';
import { ApiError } from '@/shared/api-error';

export const roleMiddleware =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Authentication is required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to access this resource'));
    }

    next();
  };
