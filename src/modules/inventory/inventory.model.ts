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
    shopifyQuantity: { type: Number, default: 0, min: 0 },
    availableQuantity: { type: Number, default: 0, min: 0 },
    safetyBuffer: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    sourceStatus: {
      type: String,
      enum: ['active', 'stale', 'deleted', 'untracked'],
      default: 'active'
    },
    staleReason: { type: String },
    staleMarkedAt: { type: Date },
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
