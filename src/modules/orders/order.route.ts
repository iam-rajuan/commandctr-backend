import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { orderController } from './order.controller';
import { orderValidation } from './order.validation';

export const orderRouter = Router();

orderRouter.use(authMiddleware);
orderRouter.post('/sandbox/seed', orderController.seedSandboxOrders);
orderRouter.get('/', validateRequest(orderValidation.listOrders), orderController.getOrders);
orderRouter.get('/stats', orderController.getOrderStats);
orderRouter.get('/export.csv', validateRequest(orderValidation.listOrders), orderController.exportOrdersCsv);
orderRouter.get('/:id', orderController.getOrderById);
orderRouter.patch('/:id/status', validateRequest(orderValidation.updateStatus), orderController.updateOrderStatus);
orderRouter.post('/:id/notes', validateRequest(orderValidation.addNote), orderController.addNote);
