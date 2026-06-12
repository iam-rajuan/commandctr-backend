import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { etsyService } from './etsy.service';

export const etsyController = {
  connectUrl: asyncHandler(async (req, res) => {
    const hostUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
    const connectUrl = await etsyService.createConnectUrl(req.user!.userId, hostUrl);
    res.status(httpStatus.OK).json(ApiResponse.success('Etsy connect URL generated successfully', { connectUrl }));
  }),
  callback: asyncHandler(async (req, res) => {
    await etsyService.handleOAuthCallback(req, res);
  }),
  status: asyncHandler(async (req, res) => {
    const result = await etsyService.getStatus(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Etsy connection status fetched successfully', result));
  }),
  disconnect: asyncHandler(async (req, res) => {
    const result = await etsyService.disconnect(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Etsy shop disconnected successfully', result));
  })
};
