import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { authService } from './auth.service';

export const getAuthPlaceholder = asyncHandler(async (_req, res) => {
  res.status(httpStatus.OK).json(ApiResponse.success(authService.getPlaceholderMessage()));
});
