import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';

import { dashboardController } from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.use(authMiddleware);
dashboardRouter.get('/overview', dashboardController.overview);
