import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';

import { ebayController } from './ebay.controller';

export const ebayRouter = Router();

ebayRouter.get('/callback', ebayController.callback);
ebayRouter.use(authMiddleware);
ebayRouter.get('/connect-url', ebayController.connectUrl);
ebayRouter.get('/status', ebayController.status);
ebayRouter.post('/disconnect', ebayController.disconnect);
