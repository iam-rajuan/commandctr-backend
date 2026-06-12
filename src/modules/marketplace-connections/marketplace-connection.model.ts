import { model, Schema } from 'mongoose';

import { MARKETPLACES } from '@/constants/app.constant';

import { IMarketplaceConnection } from './marketplace-connection.interface';

const marketplaceConnectionSchema = new Schema<IMarketplaceConnection>(
  {
    userId: { type: String, required: true, index: true },
    marketplace: { type: String, enum: MARKETPLACES, required: true, default: 'shopify' },
    providerAccountRef: { type: String, trim: true },
    displayName: { type: String, trim: true },
    shopDomain: { type: String, lowercase: true, trim: true },
    accessTokenEncrypted: { type: String },
    refreshTokenEncrypted: { type: String },
    accessTokenExpiresAt: { type: Date },
    refreshTokenExpiresAt: { type: Date },
    scopes: { type: [String], default: [] },
    status: { type: String, enum: ['connected', 'disconnected', 'error'], default: 'disconnected' },
    environment: { type: String, enum: ['sandbox', 'production'] },
    metadata: { type: Schema.Types.Mixed },
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

marketplaceConnectionSchema.index(
  { userId: 1, marketplace: 1, shopDomain: 1 },
  {
    unique: true,
    partialFilterExpression: {
      marketplace: 'shopify',
      shopDomain: { $exists: true, $type: 'string' }
    }
  }
);

marketplaceConnectionSchema.index(
  { userId: 1, marketplace: 1, environment: 1 },
  {
    unique: true,
    partialFilterExpression: {
      marketplace: 'ebay',
      environment: { $exists: true, $type: 'string' }
    }
  }
);

marketplaceConnectionSchema.index(
  { userId: 1, marketplace: 1, environment: 1 },
  {
    unique: true,
    partialFilterExpression: {
      marketplace: 'etsy',
      environment: { $exists: true, $type: 'string' }
    }
  }
);

export const MarketplaceConnectionModel = model<IMarketplaceConnection>('MarketplaceConnection', marketplaceConnectionSchema);
