import { Router } from 'express';

import { healthRouter } from '@/modules/health/health.route';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
