import { model, Schema } from 'mongoose';

const inventorySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String },
    marketplace: { type: String, default: 'shopify' },
    shopifyProductId: { type: String },
    shopifyVariantId: { type: String },
    inventoryItemId: { type: String, required: true },
    sku: { type: String },
    title: { type: String },
    availableQuantity: { type: Number, default: 0 },
    safetyBuffer: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    locationId: { type: String },
    locationName: { type: String },
    lastSyncedAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

inventorySchema.index({ userId: 1, inventoryItemId: 1, locationId: 1 }, { unique: true });

export const InventoryModel = model('Inventory', inventorySchema);
