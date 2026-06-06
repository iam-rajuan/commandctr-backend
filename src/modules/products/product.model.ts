import { model, Schema } from 'mongoose';

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
    marketplace: { type: String, default: 'shopify' },
    shopifyProductId: { type: String, required: true },
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
    lastSyncedAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

productSchema.index({ userId: 1, shopifyProductId: 1 }, { unique: true });

export const ProductModel = model<IProduct>('Product', productSchema);
