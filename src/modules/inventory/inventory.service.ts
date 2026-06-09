import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { InventoryModel } from './inventory.model';
import { inventoryUtils } from './inventory.utils';

const normalizeInventoryRow = <T extends Record<string, unknown>>(inventory: T) => {
  const availability = inventoryUtils.calculateInventoryAvailability(
    inventory.shopifyQuantity ?? inventory.availableQuantity,
    inventory.safetyBuffer,
    inventory.lowStockThreshold
  );

  return {
    ...inventory,
    shopifyQuantity: availability.shopifyQuantity,
    safetyBuffer: availability.safetyBuffer,
    lowStockThreshold: availability.lowStockThreshold,
    availableQuantity: availability.availableQuantity
  };
};

const buildInventoryKey = (inventoryItemId: string, locationId?: string | null) => `${inventoryItemId}::${locationId ?? ''}`;

export const inventoryService = {
  async getInventory(userId: string, includeInactive = false) {
    const query = includeInactive ? { userId } : { userId, isActive: { $ne: false } };
    const inventory = await InventoryModel.find(query).sort({ updatedAt: -1 }).lean();
    return inventory.map((item) => normalizeInventoryRow(item));
  },
  async getInventoryById(userId: string, inventoryId: string) {
    const inventory = await InventoryModel.findOne({ _id: inventoryId, userId }).lean();
    if (!inventory) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Inventory item not found');
    }

    return normalizeInventoryRow(inventory);
  },
  async updateInventory(userId: string, inventoryId: string, payload: Record<string, unknown>) {
    const existingInventory = await InventoryModel.findOne({ _id: inventoryId, userId });
    if (!existingInventory) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Inventory item not found');
    }

    const nextLowStockThreshold =
      'lowStockThreshold' in payload
        ? inventoryUtils.coerceNonNegativeNumber(payload.lowStockThreshold)
        : existingInventory.lowStockThreshold;
    const nextSafetyBuffer =
      'safetyBuffer' in payload ? inventoryUtils.coerceNonNegativeNumber(payload.safetyBuffer) : existingInventory.safetyBuffer;
    const nextShopifyQuantity =
      'shopifyQuantity' in payload
        ? inventoryUtils.coerceNonNegativeNumber(payload.shopifyQuantity)
        : 'availableQuantity' in payload
          ? inventoryUtils.coerceNonNegativeNumber(payload.availableQuantity) + nextSafetyBuffer
          : existingInventory.shopifyQuantity ?? existingInventory.availableQuantity ?? 0;
    const availability = inventoryUtils.calculateInventoryAvailability(nextShopifyQuantity, nextSafetyBuffer, nextLowStockThreshold);
    const nextPayload: Record<string, unknown> = {
      ...payload,
      shopifyQuantity: availability.shopifyQuantity,
      safetyBuffer: availability.safetyBuffer,
      lowStockThreshold: availability.lowStockThreshold,
      availableQuantity: availability.availableQuantity
    };

    const inventory = await InventoryModel.findOneAndUpdate({ _id: inventoryId, userId }, { $set: nextPayload }, { new: true, runValidators: true }).lean();
    if (!inventory) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Inventory item not found');
    }

    return normalizeInventoryRow(inventory);
  },
  async updateSafetyBuffer(userId: string, inventoryId: string, safetyBuffer: number) {
    return this.updateInventory(userId, inventoryId, { safetyBuffer });
  },
  async reconcileInventoryRowsForUser(userId: string, liveKeys: string[]) {
    const uniqueLiveKeys = new Set(liveKeys);
    const activeRows = await InventoryModel.find({ userId, isActive: { $ne: false } })
      .select({ _id: 1, inventoryItemId: 1, locationId: 1 })
      .lean();
    const staleIds = activeRows
      .filter((row) => !uniqueLiveKeys.has(buildInventoryKey(row.inventoryItemId, row.locationId)))
      .map((row) => row._id);

    if (!staleIds.length) {
      return { staleMarkedInactiveCount: 0 };
    }

    const result = await InventoryModel.updateMany(
      { _id: { $in: staleIds } },
      {
        $set: {
          isActive: false,
          sourceStatus: 'stale',
          staleReason: 'Not returned by latest Shopify inventory sync',
          staleMarkedAt: new Date()
        }
      }
    );

    return { staleMarkedInactiveCount: result.modifiedCount };
  }
};
