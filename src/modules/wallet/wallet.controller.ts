import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { walletService } from './wallet.service';

export const walletController = {
  getOverview: asyncHandler(async (req, res) => {
    const overview = await walletService.getOverview(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Wallet overview retrieved successfully', overview));
  })
};
