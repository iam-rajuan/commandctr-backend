import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { marketplaceConnectionService } from '@/modules/marketplace-connections/marketplace-connection.service';
import { ApiError } from '@/shared/api-error';
import { encryptionUtils } from '@/utils/encryption';

import { EbayOAuthStatePayload, EbayStatusResponse, EbayTokenResponse } from './ebay.interface';

const EBAY_STATE_TTL_SECONDS = 10 * 60;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const DEFAULT_EBAY_SCOPES = ['https://api.ebay.com/oauth/api_scope/sell.account.readonly'];
const DEFAULT_EBAY_AUTH_URLS = {
  sandbox: 'https://auth.sandbox.ebay.com/oauth2/authorize',
  production: 'https://auth.ebay.com/oauth2/authorize'
} as const;
const DEFAULT_EBAY_TOKEN_URLS = {
  sandbox: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
  production: 'https://api.ebay.com/identity/v1/oauth2/token'
} as const;
const INVALID_SCOPE_PREFIX = 'EBAY_SCOPES=';

const buildFrontendRedirectUrl = (path: string, params: Record<string, string>) => {
  if (!env.FRONTEND_URL) {
    return null;
  }

  const url = new URL(path, env.FRONTEND_URL.endsWith('/') ? env.FRONTEND_URL : `${env.FRONTEND_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

const getSingleQueryValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === 'string' ? firstValue : '';
  }

  return typeof value === 'string' ? value : '';
};

const getEbayEnvironment = () => env.EBAY_ENVIRONMENT ?? 'sandbox';

const normalizeEnvValue = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const withoutQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return withoutQuotes || undefined;
};

const normalizeScopeEntry = (scope: string) => {
  const normalized = scope.trim();
  if (!normalized) {
    return '';
  }

  return normalized.startsWith(INVALID_SCOPE_PREFIX) ? normalized.slice(INVALID_SCOPE_PREFIX.length).trim() : normalized;
};

const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value);

const maskClientId = (clientId: string) => {
  if (clientId.length <= 12) {
    return clientId;
  }

  return `${clientId.slice(0, 8)}...${clientId.slice(-6)}`;
};

const getEbayConfig = () => {
  const environment = getEbayEnvironment();
  const isProduction = environment === 'production';
  const clientId = normalizeEnvValue(
    isProduction ? env.EBAY_PRODUCTION_CLIENT_ID ?? env.EBAY_CLIENT_ID : env.EBAY_SANDBOX_CLIENT_ID ?? env.EBAY_CLIENT_ID
  );
  const clientSecret = normalizeEnvValue(
    isProduction
      ? env.EBAY_PRODUCTION_CLIENT_SECRET ?? env.EBAY_CLIENT_SECRET
      : env.EBAY_SANDBOX_CLIENT_SECRET ?? env.EBAY_CLIENT_SECRET
  );
  const ruName = normalizeEnvValue(
    isProduction ? env.EBAY_PRODUCTION_RU_NAME ?? env.EBAY_RU_NAME : env.EBAY_SANDBOX_RU_NAME ?? env.EBAY_RU_NAME
  );
  const redirectUri = normalizeEnvValue(
    isProduction
      ? env.EBAY_PRODUCTION_REDIRECT_URI ?? env.EBAY_REDIRECT_URI
      : env.EBAY_SANDBOX_REDIRECT_URI ?? env.EBAY_REDIRECT_URI
  );
  const authUrl = isProduction
    ? normalizeEnvValue(env.EBAY_PRODUCTION_AUTH_URL) ?? DEFAULT_EBAY_AUTH_URLS.production
    : normalizeEnvValue(env.EBAY_SANDBOX_AUTH_URL) ?? DEFAULT_EBAY_AUTH_URLS.sandbox;
  const tokenUrl = isProduction
    ? normalizeEnvValue(env.EBAY_PRODUCTION_TOKEN_URL) ?? DEFAULT_EBAY_TOKEN_URLS.production
    : normalizeEnvValue(env.EBAY_SANDBOX_TOKEN_URL) ?? DEFAULT_EBAY_TOKEN_URLS.sandbox;

  return {
    environment,
    clientId,
    clientSecret,
    ruName,
    redirectUri,
    authUrl,
    tokenUrl
  };
};

const getEbayScopes = () => {
  const raw = normalizeEnvValue(env.EBAY_SCOPES);
  if (!raw) {
    return DEFAULT_EBAY_SCOPES;
  }

  return raw
    .split(/[,\s]+/)
    .map((scope) => normalizeScopeEntry(scope))
    .filter(Boolean);
};

const requireEbayOAuthConfig = () => {
  const { clientId, clientSecret, ruName } = getEbayConfig();
  if (!clientId || !clientSecret || !ruName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'eBay OAuth credentials are not configured.');
  }
};

const logEbayAuthorizeUrl = (details: {
  environment: 'sandbox' | 'production';
  authUrl: string;
  clientId: string;
  ruName: string;
  scopes: string[];
  connectUrl: string;
  redirectUri?: string;
}) => {
  logger.info(
    {
      environment: details.environment,
      authUrl: details.authUrl,
      clientId: maskClientId(details.clientId),
      ruName: details.ruName,
      redirectUriMode: isLikelyUrl(details.ruName) ? 'url' : 'runame',
      configuredCallbackUrl: details.redirectUri ?? null,
      scopes: details.scopes,
      connectUrl: details.connectUrl
    },
    'Generated eBay OAuth authorize URL'
  );
};

const signOAuthState = (payload: EbayOAuthStatePayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: EBAY_STATE_TTL_SECONDS,
    issuer: 'commandctr',
    audience: 'ebay-oauth'
  });

const verifyOAuthState = (token: string): EbayOAuthStatePayload => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'commandctr',
      audience: 'ebay-oauth'
    }) as EbayOAuthStatePayload;

    if (payload.marketplace !== 'ebay') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'eBay OAuth state is invalid.');
    }

    if (!payload.userId || !payload.environment || !payload.nonce) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'eBay OAuth state is malformed.');
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.BAD_REQUEST, 'eBay OAuth state is invalid or has expired.');
  }
};

const parseScopeList = (scopeValue?: string) =>
  (scopeValue ?? '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

const exchangeAuthorizationCode = async (code: string) => {
  requireEbayOAuthConfig();
  const { clientId, clientSecret, ruName, tokenUrl, environment } = getEbayConfig();

  const credentials = Buffer.from(`${clientId!}:${clientSecret!}`).toString('base64');
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ruName!
    }).toString()
  });

  logger.info(
    {
      environment,
      tokenUrl,
      clientId: maskClientId(clientId!)
    },
    'Exchanging eBay OAuth authorization code for tokens'
  );

  const payload = (await response.json().catch(() => null)) as EbayTokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || 'Failed to exchange eBay OAuth code for tokens.';
    throw new ApiError(httpStatus.BAD_GATEWAY, message);
  }

  return payload;
};

const refreshAccessToken = async (refreshToken: string) => {
  requireEbayOAuthConfig();
  const { clientId, clientSecret, tokenUrl, environment } = getEbayConfig();

  const credentials = Buffer.from(`${clientId!}:${clientSecret!}`).toString('base64');
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: getEbayScopes().join(' ')
    }).toString()
  });

  logger.info(
    {
      environment,
      tokenUrl,
      clientId: maskClientId(clientId!)
    },
    'Refreshing eBay OAuth access token'
  );

  const payload = (await response.json().catch(() => null)) as EbayTokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || 'Failed to refresh eBay access token.';
    throw new ApiError(httpStatus.BAD_GATEWAY, message);
  }

  return payload;
};

const addSecondsToNow = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) {
    return undefined;
  }

  return new Date(Date.now() + seconds * 1000);
};

const buildStatusResponse = (connection: Awaited<ReturnType<typeof marketplaceConnectionService.getEbayConnection>>): EbayStatusResponse => ({
  connected: Boolean(connection && connection.status === 'connected' && connection.accessTokenEncrypted),
  marketplace: 'ebay',
  environment: connection?.environment ?? getEbayEnvironment(),
  displayName: connection?.displayName ?? 'eBay Seller',
  providerAccountRef: connection?.providerAccountRef ?? '',
  scopes: connection?.scopes ?? [],
  connectedAt: connection?.connectedAt ?? null,
  accessTokenExpiresAt: connection?.accessTokenExpiresAt ?? null,
  status: connection?.status ?? 'not_connected'
});

export const ebayService = {
  async createConnectUrl(userId: string) {
    requireEbayOAuthConfig();
    const config = getEbayConfig();

    const state = signOAuthState({
      userId,
      nonce: randomBytes(16).toString('hex'),
      marketplace: 'ebay',
      environment: config.environment
    });

    const scopes = getEbayScopes();
    const url = new URL(config.authUrl);
    url.searchParams.set('client_id', config.clientId!);
    url.searchParams.set('redirect_uri', config.ruName!);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);

    const connectUrl = url.toString();
    logEbayAuthorizeUrl({
      environment: config.environment,
      authUrl: config.authUrl,
      clientId: config.clientId!,
      ruName: config.ruName!,
      redirectUri: config.redirectUri,
      scopes,
      connectUrl
    });

    return connectUrl;
  },

  async handleOAuthCallback(req: Request, res: Response) {
    try {
      const state = getSingleQueryValue(req.query.state);
      const code = getSingleQueryValue(req.query.code);
      const error = getSingleQueryValue(req.query.error);
      const errorDescription = getSingleQueryValue(req.query.error_description);

      if (error) {
        throw new ApiError(httpStatus.BAD_REQUEST, errorDescription || error || 'eBay authorization was declined.');
      }

      if (!state || !code) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required eBay OAuth callback parameters.');
      }

      const oauthState = verifyOAuthState(state);
      const tokenPayload = await exchangeAuthorizationCode(code);
      const scopes = parseScopeList(tokenPayload.scope).length ? parseScopeList(tokenPayload.scope) : getEbayScopes();
      const now = new Date();

      await marketplaceConnectionService.upsertEbayConnection({
        userId: oauthState.userId,
        accessTokenEncrypted: encryptionUtils.encrypt(tokenPayload.access_token!),
        refreshTokenEncrypted: tokenPayload.refresh_token ? encryptionUtils.encrypt(tokenPayload.refresh_token) : undefined,
        accessTokenExpiresAt: addSecondsToNow(tokenPayload.expires_in),
        refreshTokenExpiresAt: addSecondsToNow(tokenPayload.refresh_token_expires_in),
        scopes,
        environment: oauthState.environment,
        displayName: 'eBay Seller',
        status: 'connected',
        connectedAt: now,
        lastCheckedAt: now
      });

      const redirectUrl = buildFrontendRedirectUrl('/integration', {
        marketplace: 'ebay',
        status: 'connected'
      });

      if (redirectUrl) {
        res.redirect(redirectUrl);
        return;
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'eBay seller account connected successfully',
        data: {
          marketplace: 'ebay',
          environment: oauthState.environment,
          status: 'connected',
          scopes
        }
      });
    } catch (error) {
      const safeMessage = error instanceof ApiError ? error.message : 'eBay connection failed.';
      const redirectUrl = buildFrontendRedirectUrl('/integration', {
        marketplace: 'ebay',
        status: 'error',
        message: safeMessage
      });

      if (redirectUrl) {
        res.redirect(redirectUrl);
        return;
      }

      throw error;
    }
  },

  async getStatus(userId: string) {
    const connection = await marketplaceConnectionService.getEbayConnection(userId, getEbayEnvironment());
    return buildStatusResponse(connection);
  },

  async disconnect(userId: string) {
    const connection = await marketplaceConnectionService.markEbayDisconnected(userId, getEbayEnvironment());
    return marketplaceConnectionService.toSafeConnection(connection);
  },

  async getValidEbayAccessToken(userId: string, environment = getEbayEnvironment()) {
    const connection = await marketplaceConnectionService.getRequiredConnection(
      userId,
      'ebay',
      environment,
      'eBay seller account is not connected.'
    );

    if (connection.status !== 'connected' || !connection.accessTokenEncrypted) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'eBay seller account is not connected.');
    }

    const expiresAt = connection.accessTokenExpiresAt?.getTime() ?? 0;
    if (expiresAt > Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS) {
      return encryptionUtils.decrypt(connection.accessTokenEncrypted);
    }

    if (!connection.refreshTokenEncrypted) {
      connection.status = 'error';
      await connection.save();
      throw new ApiError(httpStatus.BAD_REQUEST, 'eBay refresh token is unavailable. Reconnect the seller account.');
    }

    try {
      const refreshPayload = await refreshAccessToken(encryptionUtils.decrypt(connection.refreshTokenEncrypted));
      connection.accessTokenEncrypted = encryptionUtils.encrypt(refreshPayload.access_token!);
      connection.accessTokenExpiresAt = addSecondsToNow(refreshPayload.expires_in);
      connection.refreshTokenEncrypted = refreshPayload.refresh_token
        ? encryptionUtils.encrypt(refreshPayload.refresh_token)
        : connection.refreshTokenEncrypted;
      connection.refreshTokenExpiresAt = refreshPayload.refresh_token_expires_in
        ? addSecondsToNow(refreshPayload.refresh_token_expires_in)
        : connection.refreshTokenExpiresAt;
      connection.scopes = parseScopeList(refreshPayload.scope).length ? parseScopeList(refreshPayload.scope) : connection.scopes;
      connection.status = 'connected';
      connection.lastCheckedAt = new Date();
      await connection.save();

      return refreshPayload.access_token!;
    } catch (error) {
      connection.status = 'error';
      connection.lastCheckedAt = new Date();
      await connection.save();

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(httpStatus.BAD_GATEWAY, 'Failed to refresh eBay access token.');
    }
  }
};
