import { MarketplaceConnectionEnvironment, MarketplaceConnectionStatus } from '@/modules/marketplace-connections/marketplace-connection.interface';

export interface EbayOAuthStatePayload {
  userId: string;
  nonce: string;
  marketplace: 'ebay';
  environment: MarketplaceConnectionEnvironment;
}

export interface EbayTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface EbayStatusResponse {
  connected: boolean;
  marketplace: 'ebay';
  environment: MarketplaceConnectionEnvironment;
  displayName: string;
  providerAccountRef: string;
  scopes: string[];
  connectedAt: Date | null;
  accessTokenExpiresAt: Date | null;
  status: MarketplaceConnectionStatus | 'not_connected';
}
