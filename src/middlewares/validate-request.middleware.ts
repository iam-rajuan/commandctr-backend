import { ZodTypeAny } from 'zod';

import { ApiError } from '@/shared/api-error';
import { asyncHandler } from '@/shared/async-handler';
import { httpStatus } from '@/constants/http.constant';

type Schema = ZodTypeAny;

export const validateRequest = (schema: Schema) =>
  asyncHandler(async (req, _res, next) => {
    const parsed = await schema.safeParseAsync({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!parsed.success) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Validation failed', parsed.error.flatten());
    }

    next();
  });
