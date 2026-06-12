import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';

import { etsyController } from './etsy.controller';

export const etsyRouter = Router();

etsyRouter.get('/callback', etsyController.callback);
etsyRouter.use(authMiddleware);
etsyRouter.get('/connect-url', etsyController.connectUrl);
etsyRouter.get('/status', etsyController.status);
etsyRouter.post('/disconnect', etsyController.disconnect);
