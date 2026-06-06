import { HydratedDocument } from 'mongoose';

export type MarketplaceConnectionMarketplace = 'shopify';
export type MarketplaceConnectionStatus = 'connected' | 'disconnected' | 'error';

export interface IMarketplaceConnection {
  userId: string;
  marketplace: MarketplaceConnectionMarketplace;
  shopDomain: string;
  accessTokenEncrypted?: string;
  scopes: string[];
  status: MarketplaceConnectionStatus;
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastCheckedAt?: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type MarketplaceConnectionDocument = HydratedDocument<IMarketplaceConnection>;

export interface MarketplaceConnectionSafe {
  id: string;
  userId: string;
  marketplace: MarketplaceConnectionMarketplace;
  shopDomain: string;
  scopes: string[];
  status: MarketplaceConnectionStatus;
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastCheckedAt?: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
