import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { healthService } from './health.service';

export const getHealth = asyncHandler(async (_req, res) => {
  const health = healthService.getHealthStatus();

  res
    .status(httpStatus.OK)
    .json(ApiResponse.success('CommandCtr API is healthy', health));
});
