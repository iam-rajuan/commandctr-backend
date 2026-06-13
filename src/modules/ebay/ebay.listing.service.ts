import { httpStatus } from '@/constants/http.constant';
import { ProductModel } from '@/modules/products/product.model';
import { ApiError } from '@/shared/api-error';

import { ebayClient } from './ebay.client';
import { ebayInventoryService } from './ebay.inventory.service';
import { ebayOfferService } from './ebay.offer.service';

const getProduct = async (userId: string, productId: string) => {
  const product = await ProductModel.findOne({ _id: productId, userId });
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
  }

  return product;
};

export const ebayListingService = {
  async syncProductRecord(userId: string, productId: string) {
    const product = await getProduct(userId, productId);

    if (product.ebayInventoryItemId) {
      await ebayInventoryService.updateInventoryItem(userId, productId);
    } else {
      await ebayInventoryService.createInventoryItem(userId, productId);
    }

    if (product.ebayOfferId) {
      return ebayOfferService.updateOffer(userId, productId);
    }

    return ebayOfferService.createOffer(userId, productId);
  },

  async publishOffer(userId: string, productId: string) {
    await this.syncProductRecord(userId, productId);
    const product = await getProduct(userId, productId);

    if (!product.ebayOfferId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'eBay offer is missing for this product.');
    }

    const result = await ebayClient.request<{ listingId?: string }>({
      userId,
      method: 'POST',
      path: `/sell/inventory/v1/offer/${encodeURIComponent(product.ebayOfferId)}/publish`,
      operation: 'publish_offer'
    });

    product.ebayListingId = result.data?.listingId || product.ebayListingId;
    product.ebayStatus = 'active';
    product.lastEbaySyncAt = new Date();
    product.rawEbayPayload = {
      ...(typeof product.rawEbayPayload === 'object' && product.rawEbayPayload ? product.rawEbayPayload : {}),
      publish: result.data
    };
    await product.save();

    return {
      ...result,
      data: {
        offerId: product.ebayOfferId,
        listingId: product.ebayListingId,
        sku: product.ebaySku
      }
    };
  },

  async endListing(userId: string, productId: string) {
    const product = await getProduct(userId, productId);
    if (!product.ebayOfferId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'eBay offer is missing for this product.');
    }

    const result = await ebayClient.request({
      userId,
      method: 'POST',
      path: `/sell/inventory/v1/offer/${encodeURIComponent(product.ebayOfferId)}/withdraw`,
      operation: 'withdraw_offer'
    });

    product.ebayStatus = 'ended';
    product.lastEbaySyncAt = new Date();
    product.rawEbayPayload = {
      ...(typeof product.rawEbayPayload === 'object' && product.rawEbayPayload ? product.rawEbayPayload : {}),
      withdraw: { offerId: product.ebayOfferId }
    };
    await product.save();

    return {
      ...result,
      data: {
        offerId: product.ebayOfferId,
        listingId: product.ebayListingId,
        status: product.ebayStatus
      }
    };
  },

  async getListingStatus(userId: string, productId: string) {
    const product = await getProduct(userId, productId);
    if (!product.ebayOfferId) {
      return {
        success: true,
        marketplace: 'ebay' as const,
        operation: 'get_listing_status',
        statusCode: httpStatus.OK,
        retryable: false,
        data: {
          productId,
          sku: product.ebaySku,
          listingId: product.ebayListingId,
          offerId: product.ebayOfferId,
          status: product.ebayStatus ?? 'draft'
        }
      };
    }

    const offer = await ebayOfferService.getOffer(userId, product.ebayOfferId);
    return {
      ...offer,
      operation: 'get_listing_status',
      data: {
        productId,
        sku: product.ebaySku,
        listingId: product.ebayListingId,
        offerId: product.ebayOfferId,
        status: product.ebayStatus ?? 'draft',
        offer: offer.data
      }
    };
  }
};
