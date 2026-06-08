import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import {
  MarketplaceConnectionDocument,
  MarketplaceConnectionSafe
} from './marketplace-connection.interface';
import { MarketplaceConnectionModel } from './marketplace-connection.model';

const toSafeConnection = (connection: MarketplaceConnectionDocument): MarketplaceConnectionSafe => ({
  id: connection._id.toString(),
  userId: connection.userId,
  marketplace: connection.marketplace,
  shopDomain: connection.shopDomain,
  scopes: connection.scopes,
  status: connection.status,
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

  async getShopifyConnection(userId: string): Promise<MarketplaceConnectionDocument | null> {
    return MarketplaceConnectionModel.findOne({ userId, marketplace: 'shopify' }).sort({ updatedAt: -1 });
  },

  async getLatestConnectedShopifyConnection(): Promise<MarketplaceConnectionDocument | null> {
    return MarketplaceConnectionModel.findOne({
      marketplace: 'shopify',
      status: 'connected',
      accessTokenEncrypted: { $exists: true, $ne: '' }
    }).sort({ updatedAt: -1 });
  },

  async getRequiredShopifyConnection(userId: string): Promise<MarketplaceConnectionDocument> {
    const connection = await this.getShopifyConnection(userId);
    if (!connection) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Shopify store is not connected.');
    }

    return connection;
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
    const now = new Date();

    const connection = await MarketplaceConnectionModel.findOneAndUpdate(
      { userId: payload.userId, marketplace: 'shopify' },
      {
        $set: {
          marketplace: 'shopify',
          shopDomain: payload.shopDomain.toLowerCase(),
          accessTokenEncrypted: payload.accessTokenEncrypted,
          scopes: payload.scopes,
          status: payload.status ?? 'connected',
          connectedAt: payload.connectedAt ?? now,
          lastCheckedAt: payload.lastCheckedAt,
          lastSyncedAt: payload.lastSyncedAt
        },
        $unset: {
          disconnectedAt: 1
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return connection;
  },

  async markShopifyDisconnected(userId: string) {
    const connection = await MarketplaceConnectionModel.findOneAndUpdate(
      { userId, marketplace: 'shopify' },
      {
        $set: {
          status: 'disconnected',
          disconnectedAt: new Date(),
          scopes: []
        },
        $unset: {
          accessTokenEncrypted: 1
        }
      },
      { new: true }
    );

    if (!connection) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Shopify store is not connected.');
    }

    return connection;
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
  }
};
