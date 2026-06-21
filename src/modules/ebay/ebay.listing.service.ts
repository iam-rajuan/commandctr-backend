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

type EbayInventoryItemResponse = {
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number;
    };
  };
};

const getStoredQuantity = (product: Awaited<ReturnType<typeof getProduct>>) => {
  const variantQuantity = product.variants[0]?.inventoryQuantity;
  return Math.max(typeof variantQuantity === 'number' ? variantQuantity : product.totalInventory ?? 0, 0);
};

const toInventoryResponse = (
  product: Awaited<ReturnType<typeof getProduct>>,
  inventoryItem?: EbayInventoryItemResponse,
  syncError?: string
) => ({
  productId: product._id.toString(),
  productAiProductId: product.productAiProductId,
  title: product.title,
  sku: product.ebaySku || product.ebayInventoryItemId || product.variants[0]?.sku || '',
  inventoryItemId: product.ebayInventoryItemId || product.ebaySku || '',
  offerId: product.ebayOfferId,
  listingId: product.ebayListingId,
  status: product.ebayStatus ?? 'draft',
  quantity: Math.max(
    inventoryItem?.availability?.shipToLocationAvailability?.quantity ?? getStoredQuantity(product),
    0
  ),
  featuredImage: product.featuredImage,
  updatedAt: (product as typeof product & { updatedAt?: Date }).updatedAt,
  syncError
});

export const ebayListingService = {
  async getInventory(userId: string) {
    const products = await ProductModel.find({
      userId,
      $or: [{ ebayInventoryItemId: { $type: 'string' } }, { ebaySku: { $type: 'string' } }]
    }).sort({ updatedAt: -1 });

    return Promise.all(
      products.map(async (product) => {
        const sku = product.ebayInventoryItemId || product.ebaySku;
        if (!sku) {
          return toInventoryResponse(product);
        }

        try {
          const result = await ebayInventoryService.getInventoryItem(userId, sku);
          return toInventoryResponse(product, result.data as EbayInventoryItemResponse | undefined);
        } catch (error) {
          return toInventoryResponse(
            product,
            undefined,
            error instanceof Error ? error.message : 'Could not refresh eBay inventory.'
          );
        }
      })
    );
  },

  async updateInventoryQuantity(userId: string, productId: string, quantity: number) {
    const product = await getProduct(userId, productId);
    const normalizedQuantity = Math.max(Math.trunc(quantity), 0);

    const primaryVariant = product.variants[0];
    if (primaryVariant) {
      primaryVariant.inventoryQuantity = normalizedQuantity;
    } else {
      product.variants.push({
        title: 'Default Title',
        sku: product.ebaySku || product.ebayInventoryItemId,
        inventoryQuantity: normalizedQuantity
      });
    }
    product.totalInventory = normalizedQuantity;
    await product.save();

    await ebayInventoryService.updateQuantity(userId, productId, normalizedQuantity);

    const refreshedProduct = await getProduct(userId, productId);
    const sku = refreshedProduct.ebayInventoryItemId || refreshedProduct.ebaySku;
    const inventoryResult = sku ? await ebayInventoryService.getInventoryItem(userId, sku) : undefined;
    return toInventoryResponse(
      refreshedProduct,
      inventoryResult?.data as EbayInventoryItemResponse | undefined
    );
  },

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

    let offer;
    try {
      offer = await ebayOfferService.getOffer(userId, product.ebayOfferId);
    } catch (error) {
      // A 404 here means eBay no longer has this offer (e.g. it was deleted, ended,
      // or the offer id is stale after credentials/account changed). That is an
      // expected state, not a request failure — report it instead of bubbling a 404.
      if (error instanceof ApiError && error.statusCode === httpStatus.NOT_FOUND) {
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
            status: 'not_found' as const,
            offer: null,
            syncError: 'This eBay offer is no longer available.'
          }
        };
      }

      throw error;
    }

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
