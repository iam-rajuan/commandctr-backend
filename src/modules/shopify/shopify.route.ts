import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { shopifyController } from './shopify.controller';
import { shopifyValidation } from './shopify.validation';

export const shopifyRouter = Router();

shopifyRouter.get('/callback', shopifyController.callback);
shopifyRouter.get('/product-image', shopifyController.productImage);
shopifyRouter.use(authMiddleware);
shopifyRouter.get('/connect', shopifyController.connect);
shopifyRouter.get('/connect-url', shopifyController.connectUrl);
shopifyRouter.post('/disconnect', shopifyController.disconnect);
shopifyRouter.get('/status', shopifyController.status);
shopifyRouter.get('/shop', shopifyController.shop);
shopifyRouter.post('/import-products', shopifyController.importProducts);
shopifyRouter.get('/products', shopifyController.getProducts);
shopifyRouter.post('/products', validateRequest(shopifyValidation.createProduct), shopifyController.createProduct);
shopifyRouter.patch('/products', validateRequest(shopifyValidation.updateProduct), shopifyController.updateProduct);
shopifyRouter.patch('/products/:shopifyProductId', validateRequest(shopifyValidation.updateProduct), shopifyController.updateProduct);
shopifyRouter.patch('/products/price', validateRequest(shopifyValidation.updatePrice), shopifyController.updatePrice);
shopifyRouter.patch('/products/:shopifyProductId/price', validateRequest(shopifyValidation.updatePrice), shopifyController.updatePrice);
shopifyRouter.get('/orders', shopifyController.getOrders);
shopifyRouter.post('/import-orders', shopifyController.importOrders);
shopifyRouter.post('/import-disputes', shopifyController.importDisputes);
shopifyRouter.get('/locations', shopifyController.getLocations);
shopifyRouter.get('/inventory', shopifyController.getInventory);
shopifyRouter.patch('/inventory', validateRequest(shopifyValidation.updateInventory), shopifyController.updateInventory);
shopifyRouter.patch('/inventory/:inventoryItemId', validateRequest(shopifyValidation.updateInventory), shopifyController.updateInventory);
