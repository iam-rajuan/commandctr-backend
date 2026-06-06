import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';

import { orderController } from './order.controller';

export const orderRouter = Router();

orderRouter.use(authMiddleware);
orderRouter.get('/', orderController.getOrders);
orderRouter.get('/:id', orderController.getOrderById);
