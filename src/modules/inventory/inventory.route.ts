import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { inventoryController } from './inventory.controller';
import { inventoryValidation } from './inventory.validation';

export const inventoryRouter = Router();

inventoryRouter.use(authMiddleware);
inventoryRouter.get('/', inventoryController.getInventory);
inventoryRouter.get('/:id', inventoryController.getInventoryById);
inventoryRouter.patch('/:id', validateRequest(inventoryValidation.updateInventory), inventoryController.updateInventory);
inventoryRouter.patch('/:id/safety-buffer', validateRequest(inventoryValidation.updateSafetyBuffer), inventoryController.updateSafetyBuffer);
