import { RequestHandler } from 'express';

import { ApiResponse } from '@/shared/api-response';
import { httpStatus } from '@/constants/http.constant';

export const authMiddleware: RequestHandler = (_req, res) => {
  res
    .status(httpStatus.NOT_IMPLEMENTED)
    .json(ApiResponse.error('Authentication middleware is not implemented yet.'));
};
