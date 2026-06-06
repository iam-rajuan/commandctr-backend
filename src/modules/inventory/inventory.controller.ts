import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { inventoryService } from './inventory.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export const inventoryController = {
  getInventory: asyncHandler(async (req, res) => {
    const inventory = await inventoryService.getInventory(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Inventory fetched successfully', inventory));
  }),
  getInventoryById: asyncHandler(async (req, res) => {
    const inventory = await inventoryService.getInventoryById(req.user!.userId, getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('Inventory item fetched successfully', inventory));
  }),
  updateInventory: asyncHandler(async (req, res) => {
    const inventory = await inventoryService.updateInventory(req.user!.userId, getParam(req.params.id), req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Inventory updated successfully', inventory));
  }),
  updateSafetyBuffer: asyncHandler(async (req, res) => {
    const inventory = await inventoryService.updateSafetyBuffer(req.user!.userId, getParam(req.params.id), req.body.safetyBuffer);
    res.status(httpStatus.OK).json(ApiResponse.success('Safety buffer updated successfully', inventory));
  })
};
