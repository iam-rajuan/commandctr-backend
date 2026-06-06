import { z } from 'zod';

export const shopifyValidation = {
  createProduct: z.object({
    body: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      variants: z
        .array(
          z.object({
            title: z.string().min(1),
            price: z.string().min(1),
            sku: z.string().optional()
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
      status: z.string().optional(),
      tags: z.array(z.string()).optional()
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
