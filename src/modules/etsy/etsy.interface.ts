export interface EtsyOAuthStatePayload {
  userId: string;
  marketplace: 'etsy';
  environment: 'production';
}

export interface EtsyTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface EtsyStatusResponse {
  connected: boolean;
  marketplace: 'etsy';
  environment: 'production';
  displayName: string;
  providerAccountRef: string;
  scopes: string[];
  connectedAt: Date | null;
  accessTokenExpiresAt: Date | null;
  status: 'connected' | 'disconnected' | 'error' | 'not_connected';
}
