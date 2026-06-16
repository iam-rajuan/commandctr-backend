import { z } from 'zod';

const productVariantSchema = z.object({
  shopifyVariantId: z.string().min(1).optional(),
  title: z.string().min(1),
  sku: z.string().optional(),
  price: z.string().optional(),
  compareAtPrice: z.string().optional(),
  inventoryQuantity: z.number().int().min(0).optional(),
  inventoryItemId: z.string().optional()
});

const ebayItemSpecificsSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export const productValidation = {
  createProduct: z.object({
    body: z.object({
      marketplace: z.enum(['shopify', 'ebay', 'etsy']).optional(),
      shopifyProductId: z.string().min(1).optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      handle: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      totalInventory: z.number().int().min(0).optional(),
      featuredImage: z.string().optional(),
      images: z.array(z.string()).optional(),
      variants: z.array(productVariantSchema).min(1),
      ebaySku: z.string().optional(),
      ebayMarketplaceId: z.string().optional(),
      ebayCurrency: z.string().optional(),
      ebayCondition: z.string().optional(),
      ebayCategoryId: z.string().optional(),
      ebayItemSpecifics: ebayItemSpecificsSchema.optional(),
      ebayListingNotes: z.string().optional(),
      ebayDescriptionOverride: z.string().optional()
    })
  }),
  updateProduct: z.object({
    body: z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      handle: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      totalInventory: z.number().int().min(0).optional(),
      featuredImage: z.string().optional(),
      images: z.array(z.string()).optional(),
      variants: z.array(productVariantSchema).optional(),
      marketplace: z.enum(['shopify', 'ebay', 'etsy']).optional(),
      ebaySku: z.string().optional(),
      ebayMarketplaceId: z.string().optional(),
      ebayCurrency: z.string().optional(),
      ebayCondition: z.string().optional(),
      ebayCategoryId: z.string().optional(),
      ebayItemSpecifics: ebayItemSpecificsSchema.optional(),
      ebayListingNotes: z.string().optional(),
      ebayDescriptionOverride: z.string().optional()
    })
  })
};
