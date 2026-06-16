import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { productController } from './product.controller';
import { productValidation } from './product.validation';

export const productRouter = Router();

productRouter.use(authMiddleware);
productRouter.post('/', validateRequest(productValidation.createProduct), productController.createProduct);
productRouter.get('/', productController.getProducts);
productRouter.get('/:id', productController.getProductById);
productRouter.patch('/:id', validateRequest(productValidation.updateProduct), productController.updateProduct);
productRouter.delete('/:id', productController.deleteProduct);
