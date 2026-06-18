import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { ebayController } from './ebay.controller';
import { ebayValidation } from './ebay.validation';

export const ebayRouter = Router();

ebayRouter.get('/callback', ebayController.callback);
ebayRouter.use(authMiddleware);
ebayRouter.get('/connect-url', ebayController.connectUrl);
ebayRouter.get('/status', ebayController.status);
ebayRouter.post('/disconnect', ebayController.disconnect);
ebayRouter.get('/inventory', ebayController.getInventory);
ebayRouter.patch(
  '/products/:productId/inventory',
  validateRequest(ebayValidation.updateInventory),
  ebayController.updateInventory
);
ebayRouter.post('/products/:productId/sync', validateRequest(ebayValidation.productParams), ebayController.queueProductSync);
ebayRouter.post(
  '/products/:productId/sync-inventory',
  validateRequest(ebayValidation.productParams),
  ebayController.queueInventorySync
);
ebayRouter.post('/products/:productId/sync-price', validateRequest(ebayValidation.productParams), ebayController.queuePriceSync);
ebayRouter.post('/products/:productId/publish', validateRequest(ebayValidation.productParams), ebayController.queuePublish);
ebayRouter.post('/products/:productId/end', validateRequest(ebayValidation.productParams), ebayController.queueEndListing);
ebayRouter.get('/products/:productId/status', validateRequest(ebayValidation.productParams), ebayController.getListingStatus);
ebayRouter.post('/listings/pull', validateRequest(ebayValidation.pullListings), ebayController.queuePullListings);
ebayRouter.get('/jobs/:jobId', validateRequest(ebayValidation.jobParams), ebayController.getJob);
