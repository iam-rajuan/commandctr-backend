import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { ProductModel } from './product.model';

export const productService = {
  async getProducts(userId: string) {
    return ProductModel.find({ userId }).sort({ updatedAt: -1 });
  },

  async getProductById(userId: string, productId: string) {
    const product = await ProductModel.findOne({ _id: productId, userId });
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }

    return product;
  },

  async updateProduct(userId: string, productId: string, payload: Record<string, unknown>) {
    const product = await ProductModel.findOneAndUpdate(
      { _id: productId, userId },
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }

    return product;
  },

  async deleteProduct(userId: string, productId: string) {
    const product = await ProductModel.findOneAndDelete({ _id: productId, userId });
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }
  }
};
