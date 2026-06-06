import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { InventoryModel } from './inventory.model';

export const inventoryService = {
  async getInventory(userId: string) {
    return InventoryModel.find({ userId }).sort({ updatedAt: -1 });
  },
  async getInventoryById(userId: string, inventoryId: string) {
    const inventory = await InventoryModel.findOne({ _id: inventoryId, userId });
    if (!inventory) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Inventory item not found');
    }

    return inventory;
  },
  async updateInventory(userId: string, inventoryId: string, payload: Record<string, unknown>) {
    const inventory = await InventoryModel.findOneAndUpdate(
      { _id: inventoryId, userId },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!inventory) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Inventory item not found');
    }

    return inventory;
  },
  async updateSafetyBuffer(userId: string, inventoryId: string, safetyBuffer: number) {
    return this.updateInventory(userId, inventoryId, { safetyBuffer });
  }
};
