import { httpStatus } from '@/constants/http.constant';
import { ProductModel } from '@/modules/products/product.model';
import { ApiError } from '@/shared/api-error';

import { ebayClient } from './ebay.client';
import { ebayProductMapper } from './ebay.product.mapper';

export const ebayOfferService = {
  async createOffer(userId: string, productId: string) {
    const product = await ProductModel.findOne({ _id: productId, userId });
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
    }

    const payload = ebayProductMapper.toOffer(product);
    const result = await ebayClient.request<{ offerId?: string }>({
      userId,
      method: 'POST',
      path: '/sell/inventory/v1/offer',
      operation: 'create_offer',
      body: payload
    });

    const offerId = result.data?.offerId;
    if (!offerId) {
      throw new ApiError(httpStatus.BAD_GATEWAY, 'eBay create offer response did not include offerId.');
    }

    product.ebaySku = payload.sku;
    product.ebayOfferId = offerId;
    product.ebayMarketplaceId = payload.marketplaceId;
    product.ebayStatus = product.ebayStatus === 'active' ? 'active' : 'draft';
    product.lastEbaySyncAt = new Date();
    product.rawEbayPayload = {
      ...(typeof product.rawEbayPayload === 'object' && product.rawEbayPayload ? product.rawEbayPayload : {}),
      offer: result.data ?? payload
    };
    await product.save();

    return { ...result, data: { offerId, sku: payload.sku } };
  },

  async updateOffer(userId: string, productId: string) {
    const product = await ProductModel.findOne({ _id: productId, userId });
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
    }

    if (!product.ebayOfferId) {
      return this.createOffer(userId, productId);
    }

    const payload = ebayProductMapper.toOffer(product);
    const result = await ebayClient.request({
      userId,
      method: 'PUT',
      path: `/sell/inventory/v1/offer/${encodeURIComponent(product.ebayOfferId)}`,
      operation: 'update_offer',
      body: payload
    });

    product.ebaySku = payload.sku;
    product.ebayMarketplaceId = payload.marketplaceId;
    product.lastEbaySyncAt = new Date();
    product.rawEbayPayload = {
      ...(typeof product.rawEbayPayload === 'object' && product.rawEbayPayload ? product.rawEbayPayload : {}),
      offer: payload
    };
    await product.save();

    return { ...result, data: { offerId: product.ebayOfferId, sku: payload.sku } };
  },

  async getOffer(userId: string, offerId: string) {
    return ebayClient.request({
      userId,
      method: 'GET',
      path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
      operation: 'get_offer'
    });
  },

  async deleteOffer(userId: string, offerId: string) {
    return ebayClient.request({
      userId,
      method: 'DELETE',
      path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
      operation: 'delete_offer'
    });
  }
};
