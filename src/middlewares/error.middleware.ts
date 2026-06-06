import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';
import { ApiResponse } from '@/shared/api-response';

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  let statusCode = httpStatus.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';
  let details: unknown;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = 'Validation failed';
    details = error.flatten();
  } else if (error instanceof Error) {
    message = error.message;
  }

  logger.error(
    {
      err: error,
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode
    },
    'Request failed'
  );

  res.status(statusCode).json(
    ApiResponse.error(message, {
      ...(details ? { details } : {}),
      ...(env.NODE_ENV !== 'production' && error instanceof Error ? { stack: error.stack } : {})
    })
  );
};
