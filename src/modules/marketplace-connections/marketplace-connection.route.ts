import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';

import { marketplaceConnectionController } from './marketplace-connection.controller';

export const marketplaceConnectionRouter = Router();

marketplaceConnectionRouter.use(authMiddleware);
marketplaceConnectionRouter.get('/', marketplaceConnectionController.list);
