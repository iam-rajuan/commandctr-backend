import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';

import { walletController } from './wallet.controller';

export const walletRouter = Router();

walletRouter.use(authMiddleware);
walletRouter.get('/overview', walletController.getOverview);
