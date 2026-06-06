import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { SyncLogModel } from './sync-log.model';

export const syncLogService = {
  async create(payload: Record<string, unknown>) {
    const syncLog = await SyncLogModel.create(payload);
    logger.info(
      {
        syncLogId: syncLog._id.toString(),
        entityType: syncLog.entityType,
        action: syncLog.action,
        status: syncLog.status
      },
      'Sync log created'
    );

    return syncLog;
  },

  async getLogs(userId?: string) {
    return SyncLogModel.find(userId ? { userId } : {}).sort({ createdAt: -1 });
  },

  async getLogById(id: string, userId?: string) {
    const log = await SyncLogModel.findOne(userId ? { _id: id, userId } : { _id: id });
    if (!log) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Sync log not found');
    }

    return log;
  }
};
