import { RequestHandler } from 'express';

import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';

export const notFoundMiddleware: RequestHandler = (req, res) => {
  res
    .status(httpStatus.NOT_FOUND)
    .json(ApiResponse.error(`Route not found: ${req.method} ${req.originalUrl}`));
};
