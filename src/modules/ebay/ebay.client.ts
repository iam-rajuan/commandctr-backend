import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { ebayService } from './ebay.service';

const DEFAULT_EBAY_API_BASE_URLS = {
  sandbox: 'https://api.sandbox.ebay.com',
  production: 'https://api.ebay.com'
} as const;

const DEFAULT_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

export interface EbayCommerceConfig {
  environment: 'sandbox' | 'production';
  apiBaseUrl: string;
  marketplaceId: string;
  merchantLocationKey: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  fulfillmentPolicyId: string;
  categoryId: string;
  currency: string;
  listingFormat: string;
  listingDuration: string;
  condition: string;
}

export interface EbayOperationResult<T = unknown> {
  success: boolean;
  marketplace: 'ebay';
  operation: string;
  statusCode: number;
  retryable: boolean;
  data?: T;
  error?: string;
}

interface EbayRequestOptions {
  userId: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  operation: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

const normalizeEnvValue = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return unquoted || undefined;
};

const getEbayEnvironment = (): 'sandbox' | 'production' => env.EBAY_ENVIRONMENT ?? 'sandbox';

const requireValue = (value: string | undefined, name: string) => {
  if (!value) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Missing required eBay commerce configuration: ${name}.`);
  }

  return value;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getBackoffDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);

const parseResponseBody = async (response: Response) => {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const candidate = payload as {
    message?: string;
    error?: string;
    errors?: Array<{ message?: string; longMessage?: string }>;
  };

  if (candidate.message) {
    return candidate.message;
  }

  if (candidate.error) {
    return candidate.error;
  }

  if (candidate.errors?.length) {
    return candidate.errors
      .map((error) => error.longMessage || error.message)
      .filter(Boolean)
      .join('; ');
  }

  return fallback;
};

export const getEbayCommerceConfig = (): EbayCommerceConfig => {
  const environment = getEbayEnvironment();
  const apiBaseUrl =
    normalizeEnvValue(env.EBAY_API_BASE_URL) ?? DEFAULT_EBAY_API_BASE_URLS[environment];

  return {
    environment,
    apiBaseUrl,
    marketplaceId: requireValue(normalizeEnvValue(env.EBAY_MARKETPLACE_ID), 'EBAY_MARKETPLACE_ID'),
    merchantLocationKey: requireValue(
      normalizeEnvValue(env.EBAY_MERCHANT_LOCATION_KEY),
      'EBAY_MERCHANT_LOCATION_KEY'
    ),
    paymentPolicyId: requireValue(normalizeEnvValue(env.EBAY_PAYMENT_POLICY_ID), 'EBAY_PAYMENT_POLICY_ID'),
    returnPolicyId: requireValue(normalizeEnvValue(env.EBAY_RETURN_POLICY_ID), 'EBAY_RETURN_POLICY_ID'),
    fulfillmentPolicyId: requireValue(
      normalizeEnvValue(env.EBAY_FULFILLMENT_POLICY_ID),
      'EBAY_FULFILLMENT_POLICY_ID'
    ),
    categoryId: requireValue(normalizeEnvValue(env.EBAY_DEFAULT_CATEGORY_ID), 'EBAY_DEFAULT_CATEGORY_ID'),
    currency: normalizeEnvValue(env.EBAY_DEFAULT_CURRENCY) ?? 'USD',
    listingFormat: normalizeEnvValue(env.EBAY_LISTING_FORMAT) ?? 'FIXED_PRICE',
    listingDuration: normalizeEnvValue(env.EBAY_LISTING_DURATION) ?? 'GTC',
    condition: normalizeEnvValue(env.EBAY_DEFAULT_CONDITION) ?? 'NEW'
  };
};

export const ebayClient = {
  async request<T = unknown>(options: EbayRequestOptions): Promise<EbayOperationResult<T>> {
    const config = getEbayCommerceConfig();
    const url = new URL(options.path, config.apiBaseUrl);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const accessToken = await ebayService.getValidEbayAccessToken(options.userId, config.environment);
        const response = await fetch(url, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });

        const payload = (await parseResponseBody(response)) as T | Record<string, unknown> | string | null;
        if (response.ok) {
          return {
            success: true,
            marketplace: 'ebay',
            operation: options.operation,
            statusCode: response.status,
            retryable: false,
            data: (payload ?? undefined) as T | undefined
          };
        }

        const retryable = DEFAULT_RETRYABLE_STATUS_CODES.has(response.status);
        const errorMessage = extractErrorMessage(
          payload,
          `eBay ${options.operation} failed with HTTP ${response.status}.`
        );

        logger.warn(
          {
            operation: options.operation,
            statusCode: response.status,
            retryable,
            attempt: attempt + 1,
            environment: config.environment
          },
          'eBay API request failed'
        );

        if (retryable && attempt < MAX_RETRIES - 1) {
          await sleep(getBackoffDelay(attempt));
          continue;
        }

        throw new ApiError(response.status, errorMessage, {
          success: false,
          marketplace: 'ebay',
          operation: options.operation,
          statusCode: response.status,
          retryable,
          error: errorMessage,
          data: payload
        } satisfies EbayOperationResult);
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        const retryable = attempt < MAX_RETRIES - 1;
        logger.warn(
          {
            operation: options.operation,
            attempt: attempt + 1,
            retryable,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          'eBay API request raised a transport error'
        );

        if (retryable) {
          await sleep(getBackoffDelay(attempt));
          continue;
        }

        throw new ApiError(httpStatus.BAD_GATEWAY, `eBay ${options.operation} failed.`, {
          success: false,
          marketplace: 'ebay',
          operation: options.operation,
          statusCode: httpStatus.BAD_GATEWAY,
          retryable: false,
          error: error instanceof Error ? error.message : 'Unknown transport error'
        } satisfies EbayOperationResult);
      }
    }

    throw new ApiError(httpStatus.BAD_GATEWAY, `eBay ${options.operation} failed after retries.`);
  }
};
