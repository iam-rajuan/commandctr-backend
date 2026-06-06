import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { dashboardService } from './dashboard.service';

export const dashboardController = {
  overview: asyncHandler(async (req, res) => {
    const result = await dashboardService.getOverview(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Dashboard overview fetched successfully', result));
  })
};
