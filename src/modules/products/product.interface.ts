export interface ProductVariant {
  shopifyVariantId: string;
  title: string;
  sku?: string;
  price?: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  inventoryItemId?: string;
}

export interface IProduct {
  userId: string;
  marketplace: 'shopify';
  shopifyProductId: string;
  title: string;
  description?: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  status?: string;
  tags: string[];
  totalInventory?: number;
  featuredImage?: string;
  variants: ProductVariant[];
  rawShopifyData: unknown;
  lastSyncedAt?: Date;
}
