import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { marketplaceConnectionService } from '@/modules/marketplace-connections/marketplace-connection.service';
import { ApiError } from '@/shared/api-error';
import { encryptionUtils } from '@/utils/encryption';

import { EtsyOAuthStatePayload, EtsyStatusResponse } from './etsy.interface';

const ETSY_STATE_TTL_SECONDS = 10 * 60;

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

const signOAuthState = (payload: EtsyOAuthStatePayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ETSY_STATE_TTL_SECONDS,
    issuer: 'commandctr',
    audience: 'etsy-oauth'
  });

const verifyOAuthState = (token: string): EtsyOAuthStatePayload => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'commandctr',
      audience: 'etsy-oauth'
    }) as EtsyOAuthStatePayload;

    if (payload.marketplace !== 'etsy') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Etsy OAuth state is invalid.');
    }

    if (!payload.userId || !payload.environment || !payload.nonce) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Etsy OAuth state is malformed.');
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.BAD_REQUEST, 'Etsy OAuth state is invalid or has expired.');
  }
};

const buildStatusResponse = (connection: any): EtsyStatusResponse => ({
  connected: Boolean(connection && connection.status === 'connected' && connection.accessTokenEncrypted),
  marketplace: 'etsy',
  environment: connection?.environment ?? 'sandbox',
  displayName: connection?.displayName ?? 'Etsy Shop',
  providerAccountRef: connection?.providerAccountRef ?? '',
  scopes: connection?.scopes ?? [],
  connectedAt: connection?.connectedAt ?? null,
  accessTokenExpiresAt: connection?.accessTokenExpiresAt ?? null,
  status: connection?.status ?? 'not_connected'
});

export const etsyService = {
  async createConnectUrl(userId: string, hostUrl: string) {
    const state = signOAuthState({
      userId,
      nonce: randomBytes(16).toString('hex'),
      marketplace: 'etsy',
      environment: 'sandbox'
    });

    // Simulated callback URL
    const connectUrl = `${hostUrl}/callback?code=mock_etsy_code&state=${state}`;

    logger.info(
      {
        userId,
        connectUrl
      },
      'Generated simulated Etsy connection URL'
    );

    return connectUrl;
  },

  async handleOAuthCallback(req: Request, res: Response) {
    try {
      const state = getSingleQueryValue(req.query.state);
      const code = getSingleQueryValue(req.query.code);
      const error = getSingleQueryValue(req.query.error);
      const errorDescription = getSingleQueryValue(req.query.error_description);

      if (error) {
        throw new ApiError(httpStatus.BAD_REQUEST, errorDescription || error || 'Etsy connection was declined.');
      }

      if (!state || !code) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required Etsy OAuth callback parameters.');
      }

      const oauthState = verifyOAuthState(state);
      const now = new Date();

      // Upsert Etsy connection in the database
      await marketplaceConnectionService.upsertEtsyConnection({
        userId: oauthState.userId,
        accessTokenEncrypted: encryptionUtils.encrypt('mock_etsy_access_token'),
        refreshTokenEncrypted: encryptionUtils.encrypt('mock_etsy_refresh_token'),
        accessTokenExpiresAt: new Date(now.getTime() + 3600 * 1000), // 1 hour
        refreshTokenExpiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000), // 30 days
        scopes: ['listings_r', 'listings_w', 'shops_r'],
        environment: oauthState.environment,
        displayName: 'Etsy Shop',
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
          environment: oauthState.environment,
          status: 'connected',
          scopes: ['listings_r', 'listings_w', 'shops_r']
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
    const connection = await marketplaceConnectionService.getEtsyConnection(userId, 'sandbox');
    return buildStatusResponse(connection);
  },

  async disconnect(userId: string) {
    const connection = await marketplaceConnectionService.markEtsyDisconnected(userId, 'sandbox');
    return marketplaceConnectionService.toSafeConnection(connection);
  }
};
