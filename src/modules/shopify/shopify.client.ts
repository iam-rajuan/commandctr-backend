import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { ShopifyGraphQLResponse } from './shopify.interface';

const getShopifyEndpoint = (): string => {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify environment credentials are not configured');
  }

  return `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
};

export const shopifyClient = {
  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(getShopifyEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_ACCESS_TOKEN!
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      logger.error({ statusCode: response.status }, 'Shopify API request failed');
      throw new ApiError(httpStatus.BAD_GATEWAY, 'Failed to communicate with Shopify');
    }

    const payload = (await response.json()) as ShopifyGraphQLResponse<T>;

    if (payload.errors?.length) {
      logger.error({ errors: payload.errors.map((error) => error.message) }, 'Shopify GraphQL returned errors');
      throw new ApiError(httpStatus.BAD_GATEWAY, payload.errors[0]?.message ?? 'Shopify GraphQL returned an error');
    }

    if (!payload.data) {
      throw new ApiError(httpStatus.BAD_GATEWAY, 'Shopify response did not include data');
    }

    return payload.data;
  }
};
