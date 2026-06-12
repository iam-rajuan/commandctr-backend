import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import {
  IMarketplaceConnection,
  MarketplaceConnectionDocument,
  MarketplaceConnectionEnvironment,
  MarketplaceConnectionMarketplace,
  MarketplaceConnectionSafe
} from './marketplace-connection.interface';
import { MarketplaceConnectionModel } from './marketplace-connection.model';

const toSafeConnection = (connection: MarketplaceConnectionDocument): MarketplaceConnectionSafe => ({
  id: connection._id.toString(),
  userId: connection.userId,
  marketplace: connection.marketplace,
  providerAccountRef: connection.providerAccountRef,
  displayName: connection.displayName,
  shopDomain: connection.shopDomain,
  scopes: connection.scopes,
  status: connection.status,
  accessTokenExpiresAt: connection.accessTokenExpiresAt,
  refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
  environment: connection.environment,
  metadata: connection.metadata,
  connectedAt: connection.connectedAt,
  disconnectedAt: connection.disconnectedAt,
  lastCheckedAt: connection.lastCheckedAt,
  lastSyncedAt: connection.lastSyncedAt,
  createdAt: connection.createdAt,
  updatedAt: connection.updatedAt
});

export const marketplaceConnectionService = {
  toSafeConnection,

  async listUserConnections(userId: string): Promise<MarketplaceConnectionSafe[]> {
    const connections = await MarketplaceConnectionModel.find({ userId }).sort({ createdAt: -1 });
    return connections.map((connection) => toSafeConnection(connection));
  },

  async getConnection(
    userId: string,
    marketplace: MarketplaceConnectionMarketplace,
    environment?: MarketplaceConnectionEnvironment
  ): Promise<MarketplaceConnectionDocument | null> {
    const query: Record<string, unknown> = { userId, marketplace };
    if (environment) {
      query.environment = environment;
    }

    return MarketplaceConnectionModel.findOne(query).sort({ updatedAt: -1 });
  },

  async getRequiredConnection(
    userId: string,
    marketplace: MarketplaceConnectionMarketplace,
    environment?: MarketplaceConnectionEnvironment,
    notFoundMessage = 'Marketplace connection was not found.'
  ): Promise<MarketplaceConnectionDocument> {
    const connection = await this.getConnection(userId, marketplace, environment);
    if (!connection) {
      throw new ApiError(httpStatus.NOT_FOUND, notFoundMessage);
    }

    return connection;
  },

  async getShopifyConnection(userId: string): Promise<MarketplaceConnectionDocument | null> {
    return this.getConnection(userId, 'shopify');
  },

  async getLatestConnectedShopifyConnection(): Promise<MarketplaceConnectionDocument | null> {
    return MarketplaceConnectionModel.findOne({
      marketplace: 'shopify',
      status: 'connected',
      accessTokenEncrypted: { $exists: true, $ne: '' }
    }).sort({ updatedAt: -1 });
  },

  async getRequiredShopifyConnection(userId: string): Promise<MarketplaceConnectionDocument> {
    return this.getRequiredConnection(userId, 'shopify', undefined, 'Shopify store is not connected.');
  },

  async upsertShopifyConnection(payload: {
    userId: string;
    shopDomain: string;
    accessTokenEncrypted: string;
    scopes: string[];
    status?: 'connected' | 'disconnected' | 'error';
    connectedAt?: Date;
    disconnectedAt?: Date;
    lastCheckedAt?: Date;
    lastSyncedAt?: Date;
  }) {
    return this.upsertConnection({
      userId: payload.userId,
      marketplace: 'shopify',
      shopDomain: payload.shopDomain.toLowerCase(),
      accessTokenEncrypted: payload.accessTokenEncrypted,
      scopes: payload.scopes,
      status: payload.status,
      connectedAt: payload.connectedAt,
      disconnectedAt: payload.disconnectedAt,
      lastCheckedAt: payload.lastCheckedAt,
      lastSyncedAt: payload.lastSyncedAt
    });
  },

  async markShopifyDisconnected(userId: string) {
    return this.markConnectionDisconnected(userId, 'shopify', undefined, 'Shopify store is not connected.');
  },

  async getEbayConnection(userId: string, environment?: MarketplaceConnectionEnvironment) {
    return this.getConnection(userId, 'ebay', environment);
  },

  async upsertEbayConnection(payload: {
    userId: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    accessTokenExpiresAt?: Date;
    refreshTokenExpiresAt?: Date;
    scopes: string[];
    environment: MarketplaceConnectionEnvironment;
    providerAccountRef?: string;
    displayName?: string;
    status?: IMarketplaceConnection['status'];
    metadata?: Record<string, unknown>;
    connectedAt?: Date;
    disconnectedAt?: Date;
    lastCheckedAt?: Date;
    lastSyncedAt?: Date;
  }) {
    return this.upsertConnection({
      userId: payload.userId,
      marketplace: 'ebay',
      accessTokenEncrypted: payload.accessTokenEncrypted,
      refreshTokenEncrypted: payload.refreshTokenEncrypted,
      accessTokenExpiresAt: payload.accessTokenExpiresAt,
      refreshTokenExpiresAt: payload.refreshTokenExpiresAt,
      scopes: payload.scopes,
      environment: payload.environment,
      providerAccountRef: payload.providerAccountRef,
      displayName: payload.displayName,
      status: payload.status,
      metadata: payload.metadata,
      connectedAt: payload.connectedAt,
      disconnectedAt: payload.disconnectedAt,
      lastCheckedAt: payload.lastCheckedAt,
      lastSyncedAt: payload.lastSyncedAt
    });
  },

  async markEbayDisconnected(userId: string, environment?: MarketplaceConnectionEnvironment) {
    return this.markConnectionDisconnected(
      userId,
      'ebay',
      environment,
      'eBay seller account is not connected.'
    );
  },

  async markShopifyChecked(userId: string, status: 'connected' | 'error') {
    const connection = await this.getShopifyConnection(userId);
    if (!connection) {
      return null;
    }

    connection.lastCheckedAt = new Date();
    connection.status = status;
    await connection.save();
    return connection;
  },

  async markShopifySynced(userId: string) {
    const connection = await this.getShopifyConnection(userId);
    if (!connection) {
      return null;
    }

    connection.lastSyncedAt = new Date();
    connection.status = 'connected';
    await connection.save();
    return connection;
  },

  async upsertConnection(payload: {
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
    status?: IMarketplaceConnection['status'];
    environment?: MarketplaceConnectionEnvironment;
    metadata?: Record<string, unknown>;
    connectedAt?: Date;
    disconnectedAt?: Date;
    lastCheckedAt?: Date;
    lastSyncedAt?: Date;
  }) {
    const now = new Date();
    const query: Record<string, unknown> = {
      userId: payload.userId,
      marketplace: payload.marketplace
    };

    if (payload.marketplace === 'shopify') {
      query.shopDomain = payload.shopDomain?.toLowerCase();
    } else if (payload.environment) {
      query.environment = payload.environment;
    }

    const setPayload: Record<string, unknown> = {
      marketplace: payload.marketplace,
      providerAccountRef: payload.providerAccountRef,
      displayName: payload.displayName,
      shopDomain: payload.shopDomain?.toLowerCase(),
      accessTokenEncrypted: payload.accessTokenEncrypted,
      refreshTokenEncrypted: payload.refreshTokenEncrypted,
      accessTokenExpiresAt: payload.accessTokenExpiresAt,
      refreshTokenExpiresAt: payload.refreshTokenExpiresAt,
      scopes: payload.scopes,
      status: payload.status ?? 'connected',
      environment: payload.environment,
      metadata: payload.metadata,
      connectedAt: payload.connectedAt ?? now,
      lastCheckedAt: payload.lastCheckedAt,
      lastSyncedAt: payload.lastSyncedAt
    };

    const unsetPayload: Record<string, 1> = {
      disconnectedAt: 1
    };

    if (payload.disconnectedAt) {
      setPayload.disconnectedAt = payload.disconnectedAt;
      delete unsetPayload.disconnectedAt;
    }

    return MarketplaceConnectionModel.findOneAndUpdate(
      query,
      {
        $set: setPayload,
        ...(Object.keys(unsetPayload).length ? { $unset: unsetPayload } : {})
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  },

  async markConnectionDisconnected(
    userId: string,
    marketplace: MarketplaceConnectionMarketplace,
    environment?: MarketplaceConnectionEnvironment,
    notFoundMessage = 'Marketplace connection was not found.'
  ) {
    const query: Record<string, unknown> = { userId, marketplace };
    if (environment) {
      query.environment = environment;
    }

    const connection = await MarketplaceConnectionModel.findOneAndUpdate(
      query,
      {
        $set: {
          status: 'disconnected',
          disconnectedAt: new Date(),
          scopes: []
        },
        $unset: {
          accessTokenEncrypted: 1,
          refreshTokenEncrypted: 1,
          accessTokenExpiresAt: 1,
          refreshTokenExpiresAt: 1,
          metadata: 1
        }
      },
      { new: true }
    );

    if (!connection) {
      throw new ApiError(httpStatus.NOT_FOUND, notFoundMessage);
    }

    return connection;
  }
};
