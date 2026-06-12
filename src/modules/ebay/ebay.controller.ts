import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { ebayService } from './ebay.service';

export const ebayController = {
  connectUrl: asyncHandler(async (req, res) => {
    const connectUrl = await ebayService.createConnectUrl(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('eBay connect URL generated successfully', { connectUrl }));
  }),
  callback: asyncHandler(async (req, res) => {
    await ebayService.handleOAuthCallback(req, res);
  }),
  status: asyncHandler(async (req, res) => {
    const result = await ebayService.getStatus(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('eBay connection status fetched successfully', result));
  }),
  disconnect: asyncHandler(async (req, res) => {
    const result = await ebayService.disconnect(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('eBay seller account disconnected successfully', result));
  })
};
