import { httpStatus } from '@/constants/http.constant';
import { logger } from '@/config/logger';
import { ProductModel } from '@/modules/products/product.model';
import { ApiError } from '@/shared/api-error';

import { ebayClient } from './ebay.client';
import { ebayProductMapper } from './ebay.product.mapper';

// eBay errorIds that mean the offer no longer exists for this seller (stale offerId).
// 25710 = resource not found, 25713 = "This Offer is not available."
const STALE_OFFER_ERROR_IDS = new Set([25710, 25713]);

const isStaleOfferError = (error: unknown): boolean => {
  if (!(error instanceof ApiError)) {
    return false;
  }

  if (error.statusCode === httpStatus.NOT_FOUND) {
    return true;
  }

  const details = error.details as
    | { data?: { errors?: Array<{ errorId?: number }> } }
    | undefined;
  const errors = details?.data?.errors;
  if (Array.isArray(errors)) {
    return errors.some((entry) => typeof entry.errorId === 'number' && STALE_OFFER_ERROR_IDS.has(entry.errorId));
  }

  return false;
};

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
    let result;
    try {
      result = await ebayClient.request({
        userId,
        method: 'PUT',
        path: `/sell/inventory/v1/offer/${encodeURIComponent(product.ebayOfferId)}`,
        operation: 'update_offer',
        body: payload
      });
    } catch (error) {
      // The stored offerId no longer exists on eBay (e.g. stale offer from a previous
      // seller/marketplace). Clear the stale reference and create a fresh offer using
      // the current active config instead of failing the publish.
      if (isStaleOfferError(error)) {
        logger.warn(
          { productId, staleOfferId: product.ebayOfferId },
          'eBay offer is stale; clearing stored offer references and recreating'
        );

        product.ebayOfferId = undefined;
        product.ebayListingId = undefined;
        product.lastEbaySyncAt = new Date();
        await product.save();

        return this.createOffer(userId, productId);
      }

      throw error;
    }

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
