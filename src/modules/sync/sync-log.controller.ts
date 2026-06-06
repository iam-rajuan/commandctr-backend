import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { syncLogService } from './sync-log.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export const syncLogController = {
  getLogs: asyncHandler(async (req, res) => {
    const logs = await syncLogService.getLogs(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Sync logs fetched successfully', logs));
  }),
  getLogById: asyncHandler(async (req, res) => {
    const log = await syncLogService.getLogById(getParam(req.params.id), req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Sync log fetched successfully', log));
  })
};
