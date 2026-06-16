import { HydratedDocument } from 'mongoose';

export interface ProductVariant {
  shopifyVariantId?: string;
  title: string;
  sku?: string;
  price?: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  inventoryItemId?: string;
}

export interface IProduct {
  userId: string;
  marketplace: 'shopify' | 'ebay' | 'etsy';
  shopifyProductId?: string;
  title: string;
  description?: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  status?: string;
  tags: string[];
  totalInventory?: number;
  featuredImage?: string;
  images?: string[];
  variants: ProductVariant[];
  rawShopifyData?: unknown;
  lastSyncedAt?: Date;
  ebayInventoryItemId?: string;
  ebayOfferId?: string;
  ebayListingId?: string;
  ebaySku?: string;
  ebayMarketplaceId?: string;
  ebayCurrency?: string;
  ebayCondition?: string;
  ebayCategoryId?: string;
  ebayItemSpecifics?: Record<string, string[]>;
  ebayListingNotes?: string;
  ebayDescriptionOverride?: string;
  ebayStatus?: 'draft' | 'active' | 'ended';
  lastEbaySyncAt?: Date;
  rawEbayPayload?: unknown;
}

export type ProductDocument = HydratedDocument<IProduct>;
