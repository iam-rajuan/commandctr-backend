import { z } from 'zod';

export const shopifyValidation = {
  createProduct: z.object({
    body: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      category: z.string().optional(),
      handle: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      imagePath: z.string().optional(),
      publishToOnlineStore: z.boolean().optional(),
      compareAtPrice: z.string().optional(),
      costPerItem: z.string().optional(),
      chargeTax: z.boolean().optional(),
      barcode: z.string().optional(),
      inventoryTracked: z.boolean().optional(),
      continueSellingOutOfStock: z.boolean().optional(),
      stockLocations: z
        .array(
          z.object({
            name: z.string().min(1),
            available: z.number().int().min(0),
            onHand: z.number().int().min(0).optional(),
            unavailable: z.number().int().min(0).optional(),
            committed: z.number().int().min(0).optional()
          })
        )
        .optional(),
      physicalProduct: z.boolean().optional(),
      weight: z.number().nonnegative().optional(),
      weightUnit: z.string().optional(),
      countryOfOrigin: z.string().optional(),
      hsCode: z.string().optional(),
      collections: z.array(z.string().min(1)).optional(),
      themeTemplate: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      seoHandle: z.string().optional(),
      metafields: z.record(z.string(), z.string()).optional(),
      options: z
        .array(
          z.object({
            name: z.string().min(1),
            values: z.array(z.string().min(1)).min(1)
          })
        )
        .max(3)
        .optional(),
      variants: z
        .array(
          z.object({
            title: z.string().min(1),
            price: z.string().min(1),
            sku: z.string().optional(),
            inventoryQuantity: z.number().int().min(0).optional(),
            trackInventory: z.boolean().optional(),
            barcode: z.string().optional(),
            compareAtPrice: z.string().optional(),
            weight: z.number().nonnegative().optional(),
            weightUnit: z.string().optional()
          })
        )
        .min(1)
    })
  }),
  updateProduct: z.object({
    body: z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      category: z.string().optional(),
      handle: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      imagePath: z.string().optional(),
      publishToOnlineStore: z.boolean().optional(),
      compareAtPrice: z.string().optional(),
      costPerItem: z.string().optional(),
      chargeTax: z.boolean().optional(),
      barcode: z.string().optional(),
      inventoryTracked: z.boolean().optional(),
      continueSellingOutOfStock: z.boolean().optional(),
      stockLocations: z
        .array(
          z.object({
            name: z.string().min(1),
            available: z.number().int().min(0),
            onHand: z.number().int().min(0).optional(),
            unavailable: z.number().int().min(0).optional(),
            committed: z.number().int().min(0).optional()
          })
        )
        .optional(),
      physicalProduct: z.boolean().optional(),
      weight: z.number().nonnegative().optional(),
      weightUnit: z.string().optional(),
      countryOfOrigin: z.string().optional(),
      hsCode: z.string().optional(),
      collections: z.array(z.string().min(1)).optional(),
      themeTemplate: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      seoHandle: z.string().optional(),
      metafields: z.record(z.string(), z.string()).optional(),
      options: z
        .array(
          z.object({
            name: z.string().min(1),
            values: z.array(z.string().min(1)).min(1)
          })
        )
        .max(3)
        .optional(),
      variants: z
        .array(
          z.object({
            title: z.string().min(1),
            price: z.string().min(1),
            sku: z.string().optional(),
            inventoryQuantity: z.number().int().min(0).optional(),
            trackInventory: z.boolean().optional(),
            barcode: z.string().optional(),
            compareAtPrice: z.string().optional(),
            weight: z.number().nonnegative().optional(),
            weightUnit: z.string().optional()
          })
        )
        .min(1)
        .optional()
    })
  }),
  updatePrice: z.object({
    body: z.object({
      variantId: z.string().min(1),
      price: z.string().min(1),
      compareAtPrice: z.string().optional()
    })
  }),
  updateInventory: z.object({
    body: z.object({
      locationId: z.string().min(1),
      quantity: z.number().int().min(0)
    })
  })
};
