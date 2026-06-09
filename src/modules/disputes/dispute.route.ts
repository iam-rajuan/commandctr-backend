import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { disputeController } from './dispute.controller';
import { disputeValidation } from './dispute.validation';

export const disputeRouter = Router();

disputeRouter.use(authMiddleware);
disputeRouter.get('/', validateRequest(disputeValidation.listDisputes), disputeController.getDisputes);
disputeRouter.get('/:id', disputeController.getDisputeById);
