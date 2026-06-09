import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { disputeService } from './dispute.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export const disputeController = {
  getDisputes: asyncHandler(async (req, res) => {
    const result = await disputeService.getDisputes(req.user!.userId, req.query);
    res.status(httpStatus.OK).json(ApiResponse.success('Disputes retrieved successfully', result));
  }),

  getDisputeById: asyncHandler(async (req, res) => {
    const result = await disputeService.getDisputeById(req.user!.userId, getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('Dispute retrieved successfully', result));
  })
};
