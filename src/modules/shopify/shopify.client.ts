import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { ShopifyGraphQLResponse } from './shopify.interface';

const getShopifyEndpoint = (shopDomain: string): string => {
  if (!shopDomain) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify shop domain is not configured');
  }

  return `https://${shopDomain}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
};

export const shopifyClient = {
  async request<T>(params: {
    shopDomain: string;
    accessToken: string;
    query: string;
    variables?: Record<string, unknown>;
  }): Promise<T> {
    const response = await fetch(getShopifyEndpoint(params.shopDomain), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': params.accessToken
      },
      body: JSON.stringify({ query: params.query, variables: params.variables })
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
