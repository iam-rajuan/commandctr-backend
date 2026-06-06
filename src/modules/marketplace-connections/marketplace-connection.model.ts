import { model, Schema } from 'mongoose';

import { MARKETPLACES } from '@/constants/app.constant';

import { IMarketplaceConnection } from './marketplace-connection.interface';

const marketplaceConnectionSchema = new Schema<IMarketplaceConnection>(
  {
    userId: { type: String, required: true, index: true },
    marketplace: { type: String, enum: MARKETPLACES, required: true, default: 'shopify' },
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    accessTokenEncrypted: { type: String },
    scopes: { type: [String], default: [] },
    status: { type: String, enum: ['connected', 'disconnected', 'error'], default: 'disconnected' },
    connectedAt: { type: Date },
    disconnectedAt: { type: Date },
    lastCheckedAt: { type: Date },
    lastSyncedAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

marketplaceConnectionSchema.index({ userId: 1, marketplace: 1, shopDomain: 1 }, { unique: true });

export const MarketplaceConnectionModel = model<IMarketplaceConnection>('MarketplaceConnection', marketplaceConnectionSchema);
