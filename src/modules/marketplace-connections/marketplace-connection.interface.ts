import { HydratedDocument } from 'mongoose';

export type MarketplaceConnectionMarketplace = 'shopify' | 'ebay' | 'etsy';
export type MarketplaceConnectionStatus = 'connected' | 'disconnected' | 'error';
export type MarketplaceConnectionEnvironment = 'sandbox' | 'production';

export interface IMarketplaceConnection {
  userId: string;
  marketplace: MarketplaceConnectionMarketplace;
  providerAccountRef?: string;
  displayName?: string;
  shopDomain?: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scopes: string[];
  status: MarketplaceConnectionStatus;
  environment?: MarketplaceConnectionEnvironment;
  metadata?: Record<string, unknown>;
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
  providerAccountRef?: string;
  displayName?: string;
  shopDomain?: string;
  scopes: string[];
  status: MarketplaceConnectionStatus;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  environment?: MarketplaceConnectionEnvironment;
  metadata?: Record<string, unknown>;
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastCheckedAt?: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
