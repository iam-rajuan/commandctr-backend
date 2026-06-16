import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { ProductModel } from '@/modules/products/product.model';

import { ebayClient } from './ebay.client';
import { ebayProductMapper } from './ebay.product.mapper';

export const ebayInventoryService = {
  async createInventoryItem(userId: string, productId: string) {
    const product = await ProductModel.findOne({ _id: productId, userId });
    if (!product) {
      throw new Error('Product not found');
    }

    const sku = ebayProductMapper.getSku(product);
    const inventoryItem = ebayProductMapper.toInventoryItem(product);
    const normalizedCondition = ebayProductMapper.getCondition(product);

    if (env.NODE_ENV === 'development') {
      logger.info(
        {
          productId,
          sku,
          conditionInput: product.ebayCondition?.trim() || null,
          conditionEnum: normalizedCondition.conditionEnum,
          conditionId: normalizedCondition.conditionId,
          inventoryItem
        },
        'Prepared sanitized eBay create_inventory_item payload'
      );
    }

    const result = await ebayClient.request({
      userId,
      method: 'PUT',
      path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      operation: 'create_inventory_item',
      body: inventoryItem
    });

    product.ebaySku = sku;
    product.ebayInventoryItemId = sku;
    product.ebayMarketplaceId = product.ebayMarketplaceId || ebayProductMapper.toOffer(product).marketplaceId;
    product.lastEbaySyncAt = new Date();
    product.rawEbayPayload = {
      ...(typeof product.rawEbayPayload === 'object' && product.rawEbayPayload ? product.rawEbayPayload : {}),
      inventoryItem
    };
    await product.save();

    return { ...result, data: { sku, inventoryItemId: sku } };
  },

  async updateInventoryItem(userId: string, productId: string) {
    return this.createInventoryItem(userId, productId);
  },

  async getInventoryItem(userId: string, sku: string) {
    return ebayClient.request({
      userId,
      method: 'GET',
      path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      operation: 'get_inventory_item'
    });
  },

  async deleteInventoryItem(userId: string, sku: string) {
    return ebayClient.request({
      userId,
      method: 'DELETE',
      path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      operation: 'delete_inventory_item'
    });
  }
};
