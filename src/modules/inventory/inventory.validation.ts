import { z } from 'zod';

export const inventoryValidation = {
  updateInventory: z.object({
    body: z.object({
      availableQuantity: z.number().int().min(0).optional(),
      lowStockThreshold: z.number().int().min(0).optional(),
      locationName: z.string().optional()
    })
  }),
  updateSafetyBuffer: z.object({
    body: z.object({
      safetyBuffer: z.number().int().min(0)
    })
  })
};
