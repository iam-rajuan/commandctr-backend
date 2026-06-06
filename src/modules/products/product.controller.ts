import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { productService } from './product.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export const productController = {
  getProducts: asyncHandler(async (req, res) => {
    const products = await productService.getProducts(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Products fetched successfully', products));
  }),
  getProductById: asyncHandler(async (req, res) => {
    const product = await productService.getProductById(req.user!.userId, getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('Product fetched successfully', product));
  }),
  updateProduct: asyncHandler(async (req, res) => {
    const product = await productService.updateProduct(req.user!.userId, getParam(req.params.id), req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Product updated successfully', product));
  }),
  deleteProduct: asyncHandler(async (req, res) => {
    await productService.deleteProduct(req.user!.userId, getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('Product deleted successfully'));
  })
};
