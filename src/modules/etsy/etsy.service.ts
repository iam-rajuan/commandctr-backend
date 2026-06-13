import { createHash, randomBytes } from 'node:crypto';
import { Request, Response } from 'express';

import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { marketplaceConnectionService } from '@/modules/marketplace-connections/marketplace-connection.service';
import { ApiError } from '@/shared/api-error';
import { encryptionUtils } from '@/utils/encryption';

import { EtsyOAuthStateModel } from './etsy-oauth-state.model';
import { EtsyStatusResponse, EtsyTokenResponse } from './etsy.interface';

const ETSY_STATE_TTL_MS = 10 * 60 * 1000;
const ETSY_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const DEFAULT_ETSY_AUTH_URL = 'https://www.etsy.com/oauth/connect';
const DEFAULT_ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const DEFAULT_ETSY_API_BASE_URL = 'https://api.etsy.com/v3/application';
const DEFAULT_ETSY_SCOPES = ['shops_r'];

type EtsyShopLookupResponse = {
  count?: number;
  results?: Array<{
    shop_id?: number | string;
    shop_name?: string;
    title?: string;
    user_id?: number | string;
  }>;
};

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

const getEtsyConfig = () => ({
  clientId: normalizeEnvValue(env.ETSY_CLIENT_ID),
  redirectUri: normalizeEnvValue(env.ETSY_REDIRECT_URI),
  authUrl: normalizeEnvValue(env.ETSY_AUTH_URL) ?? DEFAULT_ETSY_AUTH_URL,
  tokenUrl: normalizeEnvValue(env.ETSY_TOKEN_URL) ?? DEFAULT_ETSY_TOKEN_URL,
  apiBaseUrl: normalizeEnvValue(env.ETSY_API_BASE_URL) ?? DEFAULT_ETSY_API_BASE_URL,
  sharedSecret: normalizeEnvValue(env.ETSY_SHARED_SECRET)
});

const getEtsyScopes = () => {
  const raw = normalizeEnvValue(env.ETSY_SCOPES);
  if (!raw) {
    return DEFAULT_ETSY_SCOPES;
  }

  return raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
};

const requireEtsyOAuthConfig = () => {
  const { clientId, redirectUri } = getEtsyConfig();
  if (!clientId || !redirectUri) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Etsy OAuth credentials are not configured.');
  }
};

const buildCodeVerifier = () => randomBytes(32).toString('base64url');

const buildCodeChallenge = (codeVerifier: string) =>
  createHash('sha256').update(codeVerifier).digest('base64url');

const addSecondsToNow = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) {
    return undefined;
  }

  return new Date(Date.now() + seconds * 1000);
};

const parseScopeList = (scopeValue?: string) =>
  (scopeValue ?? '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

const extractEtsyUserIdFromToken = (accessToken: string) => {
  const [userId] = accessToken.split('.');
  if (!userId || !/^\d+$/.test(userId)) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Etsy OAuth token did not include a valid user id prefix.');
  }

  return userId;
};

const createOAuthStateRecord = async (userId: string) => {
  const state = randomBytes(32).toString('hex');
  const codeVerifier = buildCodeVerifier();
  const expiresAt = new Date(Date.now() + ETSY_STATE_TTL_MS);

  await EtsyOAuthStateModel.create({
    state,
    userId,
    codeVerifier,
    marketplace: 'etsy',
    environment: 'production',
    expiresAt,
    consumed: false
  });

  return {
    state,
    codeVerifier
  };
};

const consumeOAuthStateRecord = async (state: string) => {
  const now = new Date();
  const oauthState = await EtsyOAuthStateModel.findOneAndUpdate(
    {
      state,
      marketplace: 'etsy',
      consumed: false,
      expiresAt: { $gt: now }
    },
    {
      $set: {
        consumed: true,
        consumedAt: now
      }
    },
    {
      new: true
    }
  ).lean();

  if (!oauthState) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Etsy OAuth state is invalid, expired, or already used.');
  }

  return oauthState;
};

const exchangeAuthorizationCode = async (code: string, codeVerifier: string) => {
  requireEtsyOAuthConfig();
  const { clientId, redirectUri, tokenUrl } = getEtsyConfig();

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId!,
      redirect_uri: redirectUri!,
      code,
      code_verifier: codeVerifier
    }).toString()
  });

  const payload = (await response.json().catch(() => null)) as EtsyTokenResponse | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token) {
    const message = payload?.error_description || payload?.error || 'Failed to exchange Etsy OAuth code for tokens.';
    throw new ApiError(httpStatus.BAD_GATEWAY, message);
  }

  return payload;
};

const refreshAccessToken = async (refreshToken: string) => {
  requireEtsyOAuthConfig();
  const { clientId, tokenUrl } = getEtsyConfig();

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId!,
      refresh_token: refreshToken
    }).toString()
  });

  const payload = (await response.json().catch(() => null)) as EtsyTokenResponse | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token) {
    const message = payload?.error_description || payload?.error || 'Failed to refresh Etsy access token.';
    throw new ApiError(httpStatus.BAD_GATEWAY, message);
  }

  return payload;
};

const fetchConnectedShop = async (accessToken: string, etsyUserId: string) => {
  const { apiBaseUrl, clientId, sharedSecret } = getEtsyConfig();
  if (!clientId || !sharedSecret) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/users/${encodeURIComponent(etsyUserId)}/shops`, {
    headers: {
      'x-api-key': `${clientId}:${sharedSecret}`,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    logger.warn(
      {
        etsyUserId,
        statusCode: response.status
      },
      'Failed to fetch Etsy shop details after OAuth connect'
    );
    return null;
  }

  const payload = (await response.json().catch(() => null)) as EtsyShopLookupResponse | null;
  return payload?.results?.[0] ?? null;
};

const buildStatusResponse = (
  connection: Awaited<ReturnType<typeof marketplaceConnectionService.getEtsyConnection>>
): EtsyStatusResponse => ({
  connected: Boolean(connection && connection.status === 'connected' && connection.accessTokenEncrypted),
  marketplace: 'etsy',
  environment: 'production',
  displayName: connection?.displayName ?? 'Etsy Shop',
  providerAccountRef: connection?.providerAccountRef ?? '',
  scopes: connection?.scopes ?? [],
  connectedAt: connection?.connectedAt ?? null,
  accessTokenExpiresAt: connection?.accessTokenExpiresAt ?? null,
  status: connection?.status ?? 'not_connected'
});

export const etsyService = {
  async createConnectUrl(userId: string, _hostUrl: string) {
    requireEtsyOAuthConfig();
    const { clientId, redirectUri, authUrl } = getEtsyConfig();
    const { state, codeVerifier } = await createOAuthStateRecord(userId);
    const scopes = getEtsyScopes();
    const codeChallenge = buildCodeChallenge(codeVerifier);

    const url = new URL(authUrl);
    url.searchParams.set('client_id', clientId!);
    url.searchParams.set('redirect_uri', redirectUri!);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    logger.info(
      {
        userId,
        authUrl,
        redirectUri,
        scopes
      },
      'Generated Etsy OAuth authorize URL'
    );

    return url.toString();
  },

  async handleOAuthCallback(req: Request, res: Response) {
    try {
      const state = getSingleQueryValue(req.query.state);
      const code = getSingleQueryValue(req.query.code);
      const error = getSingleQueryValue(req.query.error);
      const errorDescription = getSingleQueryValue(req.query.error_description);

      if (!state) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Missing Etsy OAuth state.');
      }

      const oauthState = await consumeOAuthStateRecord(state);

      if (error) {
        throw new ApiError(httpStatus.BAD_REQUEST, errorDescription || error || 'Etsy connection was declined.');
      }

      if (!code) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required Etsy OAuth callback code.');
      }

      const tokenPayload = await exchangeAuthorizationCode(code, oauthState.codeVerifier);
      const scopes = parseScopeList(tokenPayload.scope).length ? parseScopeList(tokenPayload.scope) : getEtsyScopes();
      const now = new Date();
      const accessToken = tokenPayload.access_token!;
      const refreshToken = tokenPayload.refresh_token!;
      const etsyUserId = extractEtsyUserIdFromToken(accessToken);
      const shop = await fetchConnectedShop(accessToken, etsyUserId);

      await marketplaceConnectionService.upsertEtsyConnection({
        userId: oauthState.userId,
        accessTokenEncrypted: encryptionUtils.encrypt(accessToken),
        refreshTokenEncrypted: encryptionUtils.encrypt(refreshToken),
        accessTokenExpiresAt: addSecondsToNow(tokenPayload.expires_in),
        refreshTokenExpiresAt: new Date(now.getTime() + ETSY_REFRESH_TOKEN_TTL_MS),
        scopes,
        environment: 'production',
        providerAccountRef: etsyUserId,
        displayName: shop?.shop_name || shop?.title || 'Etsy Shop',
        metadata: shop
          ? {
              etsyUserId,
              primaryShopId: shop.shop_id ? String(shop.shop_id) : undefined
            }
          : {
              etsyUserId
            },
        status: 'connected',
        connectedAt: now,
        lastCheckedAt: now
      });

      const redirectUrl = buildFrontendRedirectUrl('/integration', {
        marketplace: 'etsy',
        status: 'connected'
      });

      if (redirectUrl) {
        res.redirect(redirectUrl);
        return;
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Etsy shop connected successfully',
        data: {
          marketplace: 'etsy',
          environment: 'production',
          status: 'connected',
          scopes
        }
      });
    } catch (error) {
      const safeMessage = error instanceof ApiError ? error.message : 'Etsy connection failed.';
      const redirectUrl = buildFrontendRedirectUrl('/integration', {
        marketplace: 'etsy',
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
    const connection = await marketplaceConnectionService.getEtsyConnection(userId, 'production');
    return buildStatusResponse(connection);
  },

  async disconnect(userId: string) {
    const connection = await marketplaceConnectionService.markEtsyDisconnected(userId, 'production');
    return marketplaceConnectionService.toSafeConnection(connection);
  },

  async getValidEtsyAccessToken(userId: string) {
    const connection = await marketplaceConnectionService.getRequiredConnection(
      userId,
      'etsy',
      'production',
      'Etsy shop is not connected.'
    );

    if (connection.status !== 'connected' || !connection.accessTokenEncrypted) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Etsy shop is not connected.');
    }

    const expiresAt = connection.accessTokenExpiresAt?.getTime() ?? 0;
    if (expiresAt > Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS) {
      return encryptionUtils.decrypt(connection.accessTokenEncrypted);
    }

    if (!connection.refreshTokenEncrypted) {
      connection.status = 'error';
      connection.lastCheckedAt = new Date();
      await connection.save();
      throw new ApiError(httpStatus.BAD_REQUEST, 'Etsy refresh token is unavailable. Reconnect the Etsy shop.');
    }

    try {
      const refreshPayload = await refreshAccessToken(encryptionUtils.decrypt(connection.refreshTokenEncrypted));
      connection.accessTokenEncrypted = encryptionUtils.encrypt(refreshPayload.access_token!);
      connection.refreshTokenEncrypted = encryptionUtils.encrypt(refreshPayload.refresh_token!);
      connection.accessTokenExpiresAt = addSecondsToNow(refreshPayload.expires_in);
      connection.refreshTokenExpiresAt = new Date(Date.now() + ETSY_REFRESH_TOKEN_TTL_MS);
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

      throw new ApiError(httpStatus.BAD_GATEWAY, 'Failed to refresh Etsy access token.');
    }
  }
};
