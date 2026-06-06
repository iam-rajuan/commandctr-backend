import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { shopifyController } from './shopify.controller';
import { shopifyValidation } from './shopify.validation';

export const shopifyRouter = Router();

shopifyRouter.use(authMiddleware);
shopifyRouter.get('/status', shopifyController.status);
shopifyRouter.get('/shop', shopifyController.shop);
shopifyRouter.post('/import-products', shopifyController.importProducts);
shopifyRouter.get('/products', shopifyController.getProducts);
shopifyRouter.post('/products', validateRequest(shopifyValidation.createProduct), shopifyController.createProduct);
shopifyRouter.patch('/products/:shopifyProductId', validateRequest(shopifyValidation.updateProduct), shopifyController.updateProduct);
shopifyRouter.patch('/products/:shopifyProductId/price', validateRequest(shopifyValidation.updatePrice), shopifyController.updatePrice);
shopifyRouter.get('/orders', shopifyController.getOrders);
shopifyRouter.post('/import-orders', shopifyController.importOrders);
shopifyRouter.get('/locations', shopifyController.getLocations);
shopifyRouter.get('/inventory', shopifyController.getInventory);
shopifyRouter.patch('/inventory/:inventoryItemId', validateRequest(shopifyValidation.updateInventory), shopifyController.updateInventory);
