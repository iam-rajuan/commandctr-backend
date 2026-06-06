import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';

import { syncLogController } from './sync-log.controller';

export const syncLogRouter = Router();

syncLogRouter.use(authMiddleware);
syncLogRouter.get('/logs', syncLogController.getLogs);
syncLogRouter.get('/logs/:id', syncLogController.getLogById);
