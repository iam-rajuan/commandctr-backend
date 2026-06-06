import { model, Schema } from 'mongoose';

const shopifyConnectionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    shopDomain: { type: String, required: true },
    status: { type: String, default: 'connected' },
    lastSyncedAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

shopifyConnectionSchema.index({ userId: 1, shopDomain: 1 }, { unique: true });

export const ShopifyConnectionModel = model('ShopifyConnection', shopifyConnectionSchema);
