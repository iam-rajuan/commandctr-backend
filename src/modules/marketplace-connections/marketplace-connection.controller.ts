import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { marketplaceConnectionService } from './marketplace-connection.service';

export const marketplaceConnectionController = {
  list: asyncHandler(async (req, res) => {
    const result = await marketplaceConnectionService.listUserConnections(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Marketplace connections fetched successfully', result));
  })
};
