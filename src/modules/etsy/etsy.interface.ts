export interface EtsyOAuthStatePayload {
  userId: string;
  nonce: string;
  marketplace: 'etsy';
  environment: 'sandbox' | 'production';
}

export interface EtsyTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface EtsyStatusResponse {
  connected: boolean;
  marketplace: 'etsy';
  environment: 'sandbox' | 'production';
  displayName: string;
  providerAccountRef: string;
  scopes: string[];
  connectedAt: Date | null;
  accessTokenExpiresAt: Date | null;
  status: 'connected' | 'disconnected' | 'error' | 'not_connected';
}
