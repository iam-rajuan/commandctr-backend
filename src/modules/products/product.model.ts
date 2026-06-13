import { model, Schema } from 'mongoose';

import { MARKETPLACES } from '@/constants/app.constant';

import { IProduct } from './product.interface';

const variantSchema = new Schema(
  {
    shopifyVariantId: { type: String, required: true },
    title: { type: String, required: true },
    sku: { type: String },
    price: { type: String },
    compareAtPrice: { type: String },
    inventoryQuantity: { type: Number },
    inventoryItemId: { type: String }
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    userId: { type: String, required: true, index: true },
    marketplace: { type: String, enum: MARKETPLACES, default: 'shopify' },
    shopifyProductId: { type: String },
    title: { type: String, required: true },
    description: { type: String },
    handle: { type: String },
    vendor: { type: String },
    productType: { type: String },
    status: { type: String },
    tags: { type: [String], default: [] },
    totalInventory: { type: Number, default: 0 },
    featuredImage: { type: String },
    variants: { type: [variantSchema], default: [] },
    rawShopifyData: { type: Schema.Types.Mixed },
    lastSyncedAt: { type: Date },
    ebayInventoryItemId: { type: String },
    ebayOfferId: { type: String },
    ebayListingId: { type: String },
    ebaySku: { type: String },
    ebayMarketplaceId: { type: String },
    ebayStatus: { type: String, enum: ['draft', 'active', 'ended'] },
    lastEbaySyncAt: { type: Date },
    rawEbayPayload: { type: Schema.Types.Mixed }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

productSchema.index(
  { userId: 1, shopifyProductId: 1 },
  {
    unique: true,
    partialFilterExpression: { shopifyProductId: { $exists: true, $type: 'string' } }
  }
);
productSchema.index(
  { userId: 1, ebaySku: 1 },
  {
    unique: true,
    partialFilterExpression: { ebaySku: { $exists: true, $type: 'string' } }
  }
);

export const ProductModel = model<IProduct>('Product', productSchema);
