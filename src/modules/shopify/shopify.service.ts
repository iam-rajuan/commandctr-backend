import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';

import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { marketplaceConnectionService } from '@/modules/marketplace-connections/marketplace-connection.service';
import { DisputeModel } from '@/modules/disputes/dispute.model';
import { InventoryModel } from '@/modules/inventory/inventory.model';
import { inventoryService } from '@/modules/inventory/inventory.service';
import { inventoryUtils } from '@/modules/inventory/inventory.utils';
import { OrderModel } from '@/modules/orders/order.model';
import { ProductModel } from '@/modules/products/product.model';
import { syncLogService } from '@/modules/sync/sync-log.service';
import { ApiError } from '@/shared/api-error';
import { encryptionUtils } from '@/utils/encryption';
import { toSlug } from '@/utils/slug';

import { shopifyClient } from './shopify.client';
import { shopifyMapper } from './shopify.mapper';

type ShopifyInventoryLevel = {
  location?: { id?: string; name?: string };
  quantities?: Array<{ name?: string; quantity?: number }>;
};

type ShopifyVariantNode = {
  id: string;
  title: string;
  sku?: string;
  barcode?: string;
  price?: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  selectedOptions?: Array<{ name?: string; value?: string }>;
  inventoryItem?: {
    id?: string;
    tracked?: boolean;
    inventoryLevels?: {
      nodes?: ShopifyInventoryLevel[];
    };
  };
};

type ShopifyProductNode = {
  id: string;
  descriptionHtml?: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  category?: { id: string; fullName?: string; name?: string };
  collections?: {
    nodes?: Array<{ id: string; title?: string }>;
  };
  status?: string;
  tags?: string[];
  totalInventory?: number;
  featuredImage?: { url?: string };
  title: string;
  variants?: {
    nodes?: ShopifyVariantNode[];
  };
  media?: {
    nodes?: Array<{
      id: string;
      alt?: string;
      image?: { url?: string } | null;
      preview?: { image?: { url?: string } | null } | null;
    }>;
  };
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  email?: string;
  processedAt?: string;
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  currencyCode?: string;
  customer?: { firstName?: string; lastName?: string };
  totalPriceSet?: { shopMoney?: { amount?: string } };
  subtotalPriceSet?: { shopMoney?: { amount?: string } };
  totalTaxSet?: { shopMoney?: { amount?: string } };
  shippingAddress?: unknown;
  billingAddress?: unknown;
  lineItems?: {
    nodes?: Array<{
      title: string;
      sku?: string;
      quantity?: number;
      originalUnitPriceSet?: { shopMoney?: { amount?: string } };
      variant?: { id?: string };
      product?: { id?: string };
    }>;
  };
};

type ShopifyFulfillmentOrderNode = {
  id: string;
  status?: string;
  supportedActions?: Array<{ action?: string }>;
  lineItems?: {
    nodes?: Array<{
      id: string;
      remainingQuantity?: number;
    }>;
  };
};

type ShopifyMoneyV2 = {
  amount?: string;
  currencyCode?: string;
};

type ShopifyPaymentsDisputeNode = {
  id?: string;
  status?: string;
  amount?: ShopifyMoneyV2;
  initiatedAt?: string;
  finalizedOn?: string;
  evidenceDueBy?: string;
  reasonDetails?: {
    reason?: string;
    networkReasonCode?: string;
  };
  type?: string;
  order?: {
    id?: string;
    name?: string;
    email?: string;
    customer?: { firstName?: string; lastName?: string };
  };
};

type ShopifyShipmentPayload = {
  carrier?: string;
  trackingNumber: string;
  trackingUrl?: string;
  notifyCustomer?: boolean;
};

type ShopifyOrderCancellationPayload = {
  notifyCustomer?: boolean;
  reason: 'CUSTOMER' | 'DECLINED' | 'FRAUD' | 'INVENTORY' | 'STAFF' | 'OTHER';
  restock: boolean;
  refund: boolean;
  staffNote?: string;
};

type ShopifyOAuthAccessTokenResponse = {
  access_token?: string;
  scope?: string;
  scopes?: string;
};

type ResolvedShopifyAccess = {
  shopDomain: string;
  accessToken: string;
  source: 'marketplace_connection' | 'env_fallback';
};

type ShopifyProductMutationPayload = {
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  category?: string;
  handle?: string;
  status?: string;
  tags?: string[];
  imagePath?: string;
  publishToOnlineStore?: boolean;
  compareAtPrice?: string;
  costPerItem?: string;
  chargeTax?: boolean;
  barcode?: string;
  inventoryTracked?: boolean;
  continueSellingOutOfStock?: boolean;
  stockLocations?: Array<{
    name: string;
    available: number;
    onHand?: number;
    unavailable?: number;
    committed?: number;
  }>;
  physicalProduct?: boolean;
  weight?: number;
  weightUnit?: string;
  countryOfOrigin?: string;
  hsCode?: string;
  collections?: string[];
  themeTemplate?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoHandle?: string;
  metafields?: Record<string, string>;
  options?: Array<{ name: string; values: string[] }>;
  variants: Array<{
    title: string;
    price: string;
    sku?: string;
    inventoryQuantity?: number;
    trackInventory?: boolean;
    barcode?: string;
    compareAtPrice?: string;
    weight?: number;
    weightUnit?: string;
  }>;
};

type ShopifyProductMutationResult = {
  imageUploaded: boolean;
  product: ShopifyProductNode;
  publishedToOnlineStore: boolean;
  warnings: string[];
};

const isConfiguredShopifyFallbackToken = (token: string | undefined) => {
  if (!token) {
    return false;
  }

  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return ![
    'your_shopify_admin_access_token',
    'replace-me',
    'changeme',
    'change-me'
  ].includes(normalized);
};

const SHOPIFY_SCOPES = [
  'read_customers',
  'read_fulfillments',
  'write_fulfillments',
  'write_inventory',
  'read_inventory',
  'read_locations',
  'read_orders',
  'write_orders',
  'read_shopify_payments_disputes',
  'read_products',
  'write_products',
  'read_publications',
  'write_publications'
].join(',');

const SHOPIFY_DISPUTE_SCOPE_HINTS = [
  'read_shopify_payments_disputes',
  'read_shopify_payments',
  'read_shopify_payments_payouts'
];

const REQUIRED_SHOPIFY_DISPUTE_SCOPE = 'read_shopify_payments_disputes';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const oauthStateStore = new Map<string, { userId: string; createdAt: number }>();
const buildInventoryRowKey = (inventoryItemId: string, locationId?: string | null) => `${inventoryItemId}::${locationId ?? ''}`;

const productSelection = `
  id
  title
  descriptionHtml
  handle
  vendor
  productType
  category {
    id
    name
    fullName
  }
  collections(first: 100) {
    nodes {
      id
      title
    }
  }
  status
  tags
  totalInventory
  featuredImage { url }
  media(first: 20) {
    nodes {
      ... on MediaImage {
        id
        alt
        image { url }
        preview {
          image { url }
        }
      }
    }
  }
  variants(first: 50) {
    nodes {
      id
      title
      sku
      barcode
      price
      compareAtPrice
      inventoryQuantity
      selectedOptions {
        name
        value
      }
      inventoryItem {
        id
        tracked
        inventoryLevels(first: 5) {
          nodes {
            location { id name }
            quantities(names: ["available"]) { name quantity }
          }
        }
      }
    }
  }
`;

const productsQuery = `
  query GetProducts {
    products(first: 50) {
      nodes {
        ${productSelection}
      }
    }
  }
`;

const ordersQuery = `
  query GetOrders {
    orders(first: 50, sortKey: PROCESSED_AT, reverse: true) {
      nodes {
        id
        name
        email
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        customer { firstName lastName }
        totalPriceSet { shopMoney { amount } }
        subtotalPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        shippingAddress {
          name
          company
          address1
          address2
          city
          province
          zip
          country
          countryCodeV2
          phone
          formatted
        }
        billingAddress {
          name
          company
          address1
          address2
          city
          province
          zip
          country
          countryCodeV2
          phone
          formatted
        }
        lineItems(first: 50) {
          nodes {
            title
            sku
            quantity
            originalUnitPriceSet { shopMoney { amount } }
            variant { id }
            product { id }
          }
        }
      }
    }
  }
`;

const fulfillmentOrdersQuery = `
  query GetOrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      fulfillmentOrders(first: 20) {
        nodes {
          id
          status
          supportedActions { action }
          lineItems(first: 50) {
            nodes {
              id
              remainingQuantity
            }
          }
        }
      }
    }
  }
`;

const shopifyPaymentsDisputesQuery = `
  query GetShopifyPaymentsDisputes {
    disputes(first: 50) {
      nodes {
        id
        status
        initiatedAt
        finalizedOn
        evidenceDueBy
        type
        reasonDetails {
          reason
          networkReasonCode
        }
        amount {
          amount
          currencyCode
        }
        order {
          id
          name
          email
          customer {
            firstName
            lastName
          }
        }
      }
    }
  }
`;

type ShopifyDisputeImportResult =
  | {
      success: false;
      reason: 'missing_scope';
      requiredScope: typeof REQUIRED_SHOPIFY_DISPUTE_SCOPE;
      count: 0;
      message: string;
    }
  | {
      success: false;
      reason: 'shopify_api_error';
      count: 0;
      message: string;
      details: {
        provider: 'shopify';
        operation: 'disputes';
        statusCode?: number;
        errorMessage?: string;
      };
    }
  | {
      success: true;
      reason: 'no_disputes';
      count: 0;
      message: string;
    }
  | {
      success: true;
      reason: 'imported';
      count: number;
      message: string;
    };

const getSingleQueryValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : '';
  }

  return typeof value === 'string' ? value : '';
};

const cleanupExpiredStates = () => {
  const now = Date.now();

  for (const [state, entry] of oauthStateStore.entries()) {
    if (now - entry.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStateStore.delete(state);
    }
  }
};

const createOAuthState = (userId: string) => {
  cleanupExpiredStates();
  const state = randomBytes(24).toString('hex');
  oauthStateStore.set(state, { userId, createdAt: Date.now() });
  return state;
};

const consumeOAuthState = (state: string) => {
  cleanupExpiredStates();
  const entry = oauthStateStore.get(state);

  if (!entry) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify OAuth state is invalid or has expired');
  }

  oauthStateStore.delete(state);
  return entry.userId;
};

const getRawQueryString = (req: Request) => {
  const queryStart = req.originalUrl.indexOf('?');
  return queryStart >= 0 ? req.originalUrl.slice(queryStart + 1) : '';
};

const parseRawQueryParams = (rawQuery: string) =>
  rawQuery
    .split('&')
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      const rawKey = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
      const rawValue = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : '';
      const decodedKey = decodeURIComponent(rawKey.replace(/\+/g, '%20'));

      return {
        rawKey,
        rawValue,
        decodedKey
      };
    });

const buildShopifyHmacMessage = (req: Request) => {
  const params = parseRawQueryParams(getRawQueryString(req))
    .filter(({ decodedKey }) => decodedKey !== 'hmac' && decodedKey !== 'signature')
    .sort((left, right) => {
      if (left.decodedKey === right.decodedKey) {
        return left.rawValue.localeCompare(right.rawValue);
      }

      return left.decodedKey.localeCompare(right.decodedKey);
    });

  return params.map(({ rawKey, rawValue }) => `${rawKey}=${rawValue}`).join('&');
};

const logShopifyHmacDebug = (details: {
  hasClientSecret: boolean;
  keys: string[];
  generatedHmac: string;
  receivedHmac: string;
  isValid: boolean;
}) => {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  logger.info(
    {
      hasClientSecret: details.hasClientSecret,
      callbackKeys: details.keys,
      generatedHmacPrefix: details.generatedHmac.slice(0, 6),
      receivedHmacPrefix: details.receivedHmac.slice(0, 6),
      isValid: details.isValid
    },
    'Shopify callback HMAC validation debug'
  );
};

const isValidShopifyHmac = (req: Request) => {
  const rawParams = parseRawQueryParams(getRawQueryString(req));
  const filteredParams = rawParams.filter(
    ({ decodedKey }) => decodedKey !== 'hmac' && decodedKey !== 'signature'
  );
  const hmac = getSingleQueryValue(req.query.hmac).toLowerCase();

  if (!hmac || !env.SHOPIFY_CLIENT_SECRET) {
    logShopifyHmacDebug({
      hasClientSecret: Boolean(env.SHOPIFY_CLIENT_SECRET),
      keys: filteredParams.map(({ decodedKey }) => decodedKey).sort((left, right) => left.localeCompare(right)),
      generatedHmac: '',
      receivedHmac: hmac,
      isValid: false
    });

    return false;
  }

  const message = buildShopifyHmacMessage(req);
  const digest = createHmac('sha256', env.SHOPIFY_CLIENT_SECRET)
    .update(message)
    .digest('hex')
    .toLowerCase();

  let isValid = false;

  try {
    isValid = timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch {
    isValid = false;
  }

  logShopifyHmacDebug({
    hasClientSecret: true,
    keys: filteredParams.map(({ decodedKey }) => decodedKey).sort((left, right) => left.localeCompare(right)),
    generatedHmac: digest,
    receivedHmac: hmac,
    isValid
  });

  return isValid;
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

const exchangeOAuthCodeForToken = async (shopDomain: string, code: string) => {
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify OAuth credentials are not configured');
  }

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET,
      code
    })
  });

  if (!response.ok) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Failed to exchange Shopify OAuth code for an access token');
  }

  const payload = (await response.json()) as ShopifyOAuthAccessTokenResponse;
  if (!payload.access_token) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Shopify OAuth token response did not include an access token');
  }

  return {
    accessToken: payload.access_token,
    scopes: (payload.scope ?? payload.scopes ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  };
};

const resolveShopifyAccess = async (userId: string): Promise<ResolvedShopifyAccess> => {
  const connection = await marketplaceConnectionService.getShopifyConnection(userId);
  if (connection?.accessTokenEncrypted) {
    if (!connection.shopDomain) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify store is missing its shop domain.');
    }

    return {
      shopDomain: connection.shopDomain,
      accessToken: encryptionUtils.decrypt(connection.accessTokenEncrypted),
      source: 'marketplace_connection'
    };
  }

  if (connection) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify store is not connected.');
  }

  if (env.NODE_ENV === 'development') {
    const sharedDevelopmentConnection = await marketplaceConnectionService.getLatestConnectedShopifyConnection();
    if (sharedDevelopmentConnection?.accessTokenEncrypted) {
      if (!sharedDevelopmentConnection.shopDomain) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Shared Shopify development connection is missing its shop domain.');
      }

      logger.warn(
        {
          requestedUserId: userId,
          connectionUserId: sharedDevelopmentConnection.userId,
          shopDomain: sharedDevelopmentConnection.shopDomain
        },
        'Using shared development Shopify OAuth connection for order sync'
      );

      return {
        shopDomain: sharedDevelopmentConnection.shopDomain,
        accessToken: encryptionUtils.decrypt(sharedDevelopmentConnection.accessTokenEncrypted),
        source: 'marketplace_connection'
      };
    }
  }

  if (env.SHOPIFY_SHOP_DOMAIN && isConfiguredShopifyFallbackToken(env.SHOPIFY_ADMIN_ACCESS_TOKEN)) {
    return {
      shopDomain: env.SHOPIFY_SHOP_DOMAIN,
      accessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
      source: 'env_fallback'
    };
  }

  throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify store is not connected.');
};

const executeShopifyRequest = async <T>(userId: string, query: string, variables?: Record<string, unknown>) => {
  const access = await resolveShopifyAccess(userId);
  const data = await shopifyClient.request<T>({
    shopDomain: access.shopDomain,
    accessToken: access.accessToken,
    query,
    variables
  });

  if (access.source === 'marketplace_connection') {
    await marketplaceConnectionService.markShopifyChecked(userId, 'connected');
  }

  return { access, data };
};

const fetchShopifyProductById = async (userId: string, productId: string): Promise<ShopifyProductNode> => {
  const { data } = await executeShopifyRequest<{ product: ShopifyProductNode | null }>(
    userId,
    `
      query GetProduct($id: ID!) {
        product(id: $id) {
          ${productSelection}
        }
      }
    `,
    { id: productId }
  );

  if (!data.product) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Shopify product was created but could not be fetched afterwards');
  }

  return data.product;
};

const fetchShopifyAvailableQuantity = async (userId: string, inventoryItemId: string, locationId: string) => {
  const { data } = await executeShopifyRequest<{
    inventoryItem: {
      inventoryLevel?: {
        quantities?: Array<{ name?: string; quantity?: number }>;
      } | null;
    } | null;
  }>(
    userId,
    `
      query GetInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
        inventoryItem(id: $inventoryItemId) {
          inventoryLevel(locationId: $locationId) {
            quantities(names: ["available"]) {
              name
              quantity
            }
          }
        }
      }
    `,
    {
      inventoryItemId,
      locationId
    }
  );

  const quantity = data.inventoryItem?.inventoryLevel?.quantities?.find((entry) => entry.name === 'available')?.quantity;

  if (typeof quantity !== 'number') {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Could not determine the current Shopify inventory quantity for this location');
  }

  return quantity;
};

const upsertLocalShopifyProduct = async (userId: string, product: ShopifyProductNode) => {
  const mapped = shopifyMapper.toLocalProduct(userId, product);
  const existingProduct = await ProductModel.findOne({ userId, shopifyProductId: mapped.shopifyProductId })
    .select({ _id: 1 })
    .lean();
  const localProduct = await ProductModel.findOneAndUpdate(
    { userId, shopifyProductId: mapped.shopifyProductId },
    { $set: mapped },
    { upsert: true, new: true }
  );

  return {
    mapped,
    localProduct,
    wasCreated: !existingProduct
  };
};

const getPrimaryShopifyLocation = async (userId: string) => {
  try {
    const { data } = await executeShopifyRequest<{
      locations: {
        nodes: Array<{ id: string; name?: string }>;
      };
    }>(
      userId,
      `
        query GetPrimaryLocation {
          locations(first: 20) {
            nodes {
              id
              name
            }
          }
        }
      `
    );

    const location = data.locations.nodes[0];
    if (!location?.id) {
      return null;
    }

    return {
      id: location.id,
      name: location.name ?? 'Default'
    };
  } catch (error) {
    logger.warn(
      {
        userId,
        message: error instanceof Error ? error.message : 'Unknown Shopify location lookup failure'
      },
      'Could not resolve primary Shopify location for inventory sync'
    );
    return null;
  }
};

const syncInventoryRowsFromShopifyProduct = async ({
  userId,
  localProduct,
  shopifyProduct,
  fallbackLocation
}: {
  userId: string;
  localProduct: { _id?: { toString(): string } | string } | null;
  shopifyProduct: ShopifyProductNode;
  fallbackLocation: { id: string; name: string } | null;
}) => {
  let syncedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  const liveKeys: string[] = [];

  for (const variant of shopifyProduct.variants?.nodes ?? []) {
    const inventoryItemId = variant.inventoryItem?.id;
    if (!inventoryItemId || variant.inventoryItem?.tracked === false) {
      continue;
    }

    const levels = variant.inventoryItem?.inventoryLevels?.nodes ?? [];
    const levelsToSync = levels.length
      ? levels
      : [{
          location: {
            id: fallbackLocation?.id ?? 'unknown',
            name: fallbackLocation?.name ?? 'Default'
          },
          quantities: [{ name: 'available', quantity: variant.inventoryQuantity ?? 0 }]
        }];

    for (const level of levelsToSync) {
      const locationId = level.location?.id ?? fallbackLocation?.id ?? 'unknown';
      const locationName = level.location?.name ?? fallbackLocation?.name ?? 'Default';
      const existing = await InventoryModel.findOne({ userId, inventoryItemId, locationId });
      const mappedInventory = shopifyMapper.toLocalInventory(userId, shopifyProduct, variant, level);
      const availability = inventoryUtils.calculateInventoryAvailability(
        level.quantities?.[0]?.quantity ?? variant.inventoryQuantity ?? 0,
        existing?.safetyBuffer ?? 0,
        existing?.lowStockThreshold ?? 5
      );
      liveKeys.push(buildInventoryRowKey(inventoryItemId, locationId));

      const nextInventoryPayload = {
        ...mappedInventory,
        productId: localProduct?._id ? localProduct._id.toString() : undefined,
        marketplace: 'shopify' as const,
        shopifyProductId: shopifyProduct.id,
        shopifyVariantId: variant.id,
        inventoryItemId,
        sku: variant.sku ?? existing?.sku ?? '',
        title: mappedInventory.title || `${shopifyProduct.title} - ${variant.title}`,
        shopifyQuantity: availability.shopifyQuantity,
        availableQuantity: availability.availableQuantity,
        safetyBuffer: availability.safetyBuffer,
        lowStockThreshold: availability.lowStockThreshold,
        isActive: true,
        sourceStatus: 'active' as const,
        locationId,
        locationName,
        lastSyncedAt: new Date()
      };

      if (existing) {
        await InventoryModel.updateOne(
          { _id: existing._id },
          {
            $set: nextInventoryPayload,
            $unset: {
              staleReason: 1,
              staleMarkedAt: 1
            }
          }
        );
      } else {
        await InventoryModel.create(nextInventoryPayload);
      }

      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
      syncedCount += 1;
    }
  }

  return {
    syncedCount,
    createdCount,
    updatedCount,
    liveKeys
  };
};

const updateShopifyVariantPrice = async (userId: string, productId: string, variantId: string, price: string) => {
  const { data } = await executeShopifyRequest<{
    productVariantsBulkUpdate: {
      productVariants: Array<{ id: string; price?: string }>;
      userErrors: Array<{ message: string }>;
    };
  }>(
    userId,
    `
      mutation UpdateCreatedVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
          }
          userErrors { message }
        }
      }
    `,
    {
      productId,
      variants: [{ id: variantId, price }]
    }
  );

  if (data.productVariantsBulkUpdate.userErrors.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      data.productVariantsBulkUpdate.userErrors[0]?.message ?? 'Shopify variant price update failed'
    );
  }

  return data.productVariantsBulkUpdate.productVariants[0];
};

const updateShopifyInventoryItemSku = async (userId: string, inventoryItemId: string, sku: string) => {
  const { data } = await executeShopifyRequest<{
    inventoryItemUpdate: {
      inventoryItem: { id: string; sku?: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    userId,
    `
      mutation UpdateCreatedVariantSku($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          inventoryItem {
            id
            sku
          }
          userErrors { message }
        }
      }
    `,
    {
      id: inventoryItemId,
      input: { sku }
    }
  );

  if (data.inventoryItemUpdate.userErrors.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      data.inventoryItemUpdate.userErrors[0]?.message ?? 'Shopify variant SKU update failed'
    );
  }

  return data.inventoryItemUpdate.inventoryItem;
};

const updateShopifyInventoryItem = async (
  userId: string,
  inventoryItemId: string,
  input: Record<string, unknown>
) => {
  const { data } = await executeShopifyRequest<{
    inventoryItemUpdate: {
      inventoryItem: { id: string; sku?: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    userId,
    `
      mutation UpdateInventoryItem($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          inventoryItem {
            id
            sku
          }
          userErrors { message }
        }
      }
    `,
    {
      id: inventoryItemId,
      input
    }
  );

  if (data.inventoryItemUpdate.userErrors.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      data.inventoryItemUpdate.userErrors[0]?.message ?? 'Shopify inventory item update failed'
    );
  }

  return data.inventoryItemUpdate.inventoryItem;
};

const buildShopifyImageMarker = (imagePath: string) =>
  `commandctr-shopify-image:${createHash('sha256').update(imagePath).digest('hex').slice(0, 16)}`;

const getFrontendImageProxyUrl = (imagePath: string) => {
  if (!env.FRONTEND_URL) {
    return null;
  }

  const url = new URL('/api/product-ai/image', env.FRONTEND_URL.endsWith('/') ? env.FRONTEND_URL : `${env.FRONTEND_URL}/`);
  url.searchParams.set('path', imagePath);
  return url.toString();
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const getPublicShopifyImageUrl = (imagePath: string) => {
  if (!env.SHOPIFY_APP_URL) {
    return null;
  }

  const url = new URL(env.SHOPIFY_APP_URL);
  url.pathname = `${env.API_PREFIX}/shopify/product-image`;
  url.searchParams.set('path', imagePath);
  return url.toString();
};

const resolveShopifyCategoryId = async (userId: string, category: string | undefined) => {
  const normalizedCategory = category?.trim();
  if (!normalizedCategory) {
    return null;
  }

  try {
    const { data } = await executeShopifyRequest<{
      taxonomy: {
        categories: {
          nodes: Array<{
            id: string;
            name: string;
            fullName: string;
            isLeaf: boolean;
            isArchived: boolean;
          }>;
        };
      };
    }>(
      userId,
      `
        query SearchTaxonomyCategories($search: String!) {
          taxonomy {
            categories(search: $search, first: 10) {
              nodes {
                id
                name
                fullName
                isLeaf
                isArchived
              }
            }
          }
        }
      `,
      { search: normalizedCategory }
    );

    const categories = data.taxonomy.categories.nodes.filter((node) => !node.isArchived);
    if (!categories.length) {
      return null;
    }

    const loweredSearch = normalizedCategory.toLowerCase();
    const exactFullName = categories.find((node) => node.fullName.toLowerCase() === loweredSearch);
    if (exactFullName) {
      return exactFullName.id;
    }

    const exactName = categories.find((node) => node.name.toLowerCase() === loweredSearch);
    if (exactName) {
      return exactName.id;
    }

    const leafMatch = categories.find((node) => node.isLeaf);
    const fallbackCategory = categories[0]!;
    return (leafMatch ?? fallbackCategory).id;
  } catch (error) {
    logger.warn(
      {
        userId,
        category: normalizedCategory,
        message: error instanceof Error ? error.message : 'Unknown taxonomy lookup failure'
      },
      'Shopify category lookup failed'
    );
    return null;
  }
};

const normalizeShopifyTemplateSuffix = (themeTemplate: string | undefined) => {
  const normalized = themeTemplate?.trim();
  if (!normalized || normalized.toLowerCase() === 'default product') {
    return undefined;
  }

  return normalized.replace(/^product\./i, '').trim();
};

const normalizeShopifyWeightUnit = (weightUnit: string | undefined) => {
  const normalized = weightUnit?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'lb' || normalized === 'lbs' || normalized === 'pound' || normalized === 'pounds') {
    return 'POUNDS';
  }
  if (normalized === 'oz' || normalized === 'ounce' || normalized === 'ounces') {
    return 'OUNCES';
  }
  if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') {
    return 'KILOGRAMS';
  }
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') {
    return 'GRAMS';
  }

  return undefined;
};

const getExplicitShopifyOptions = (payload: ShopifyProductMutationPayload) => {
  const normalizedOptions = (payload.options ?? [])
    .map((option) => ({
      name: option.name.trim(),
      values: option.values.map((value) => value.trim()).filter(Boolean)
    }))
    .filter((option) => option.name && option.values.length);

  return normalizedOptions;
};

const parseShopifyMetafieldKey = (rawKey: string) => {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return null;
  }

  const [maybeNamespace, ...rest] = trimmed.split('.');
  if (rest.length === 0) {
    const key = toSlug(maybeNamespace ?? '');
    return key ? { namespace: 'custom', key } : null;
  }

  const namespace = toSlug(maybeNamespace ?? '');
  const key = toSlug(rest.join('.'));
  if (!namespace || !key) {
    return null;
  }

  return { namespace, key };
};

const buildShopifyMetafieldInputs = (metafields: ShopifyProductMutationPayload['metafields']) => {
  if (!metafields) {
    return undefined;
  }

  const entries = Object.entries(metafields)
    .map(([rawKey, rawValue]) => {
      const parsedKey = parseShopifyMetafieldKey(rawKey);
      const value = rawValue?.trim();
      if (!parsedKey || !value) {
        return null;
      }

      const type = value.includes('\n')
        ? 'multi_line_text_field'
        : /^(true|false)$/i.test(value)
          ? 'boolean'
          : /^-?\d+(\.\d+)?$/.test(value)
            ? 'number_decimal'
            : 'single_line_text_field';

      return {
        namespace: parsedKey.namespace,
        key: parsedKey.key,
        type,
        value
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return entries.length ? entries : undefined;
};

const resolveShopifyCollectionIds = async (userId: string, collections: string[] | undefined) => {
  const desiredCollections = (collections ?? []).map((value) => value.trim()).filter(Boolean);
  if (!desiredCollections.length) {
    return { ids: [] as string[], missing: [] as string[] };
  }

  const { data } = await executeShopifyRequest<{
    collections: {
      nodes: Array<{ id: string; title?: string; handle?: string }>;
    };
  }>(
    userId,
    `
      query GetCollectionsForProductSync {
        collections(first: 100) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `
  );

  const lookup = new Map<string, string>();
  for (const collection of data.collections.nodes) {
    if (collection.title) {
      lookup.set(collection.title.trim().toLowerCase(), collection.id);
    }
    if (collection.handle) {
      lookup.set(collection.handle.trim().toLowerCase(), collection.id);
    }
  }

  const ids: string[] = [];
  const missing: string[] = [];
  for (const collectionName of desiredCollections) {
    const matchedId = lookup.get(collectionName.toLowerCase()) ?? lookup.get(toSlug(collectionName));
    if (matchedId) {
      ids.push(matchedId);
    } else {
      missing.push(collectionName);
    }
  }

  return { ids: [...new Set(ids)], missing };
};

const resolveShopifyLocationsByName = async (userId: string, stockLocations: ShopifyProductMutationPayload['stockLocations']) => {
  if (!stockLocations?.length) {
    return [];
  }

  const { data } = await executeShopifyRequest<{
    locations: {
      nodes: Array<{ id: string; name?: string }>;
    };
  }>(
    userId,
    `
      query GetLocationsForProductSync {
        locations(first: 50) {
          nodes {
            id
            name
          }
        }
      }
    `
  );

  const byName = new Map(
    data.locations.nodes
      .filter((node): node is { id: string; name: string } => Boolean(node.id && node.name))
      .map((node) => [node.name.trim().toLowerCase(), node])
  );

  return stockLocations.map((location) => ({
    requested: location,
    matched: byName.get(location.name.trim().toLowerCase()) ?? null
  }));
};

const buildShopifyInventoryItemInput = ({
  payload,
  variant
}: {
  payload: ShopifyProductMutationPayload;
  variant: ShopifyProductMutationPayload['variants'][number];
}) => {
  const weightValue = variant.weight ?? payload.weight;
  const weightUnit = variant.weightUnit ?? payload.weightUnit;
  const cost = payload.costPerItem?.trim();
  const countryCodeOfOrigin = payload.countryOfOrigin?.trim().toUpperCase();
  const harmonizedSystemCode = payload.hsCode?.trim();
  const sku = variant.sku?.trim();

  const input: Record<string, unknown> = {};

  if (typeof variant.trackInventory === 'boolean') {
    input.tracked = variant.trackInventory;
  } else if (typeof payload.inventoryTracked === 'boolean') {
    input.tracked = payload.inventoryTracked;
  }

  if (sku) {
    input.sku = sku;
  }

  if (typeof payload.physicalProduct === 'boolean') {
    input.requiresShipping = payload.physicalProduct;
  }

  if (cost) {
    input.cost = cost;
  }

  if (countryCodeOfOrigin) {
    input.countryCodeOfOrigin = countryCodeOfOrigin;
  }

  if (harmonizedSystemCode) {
    input.harmonizedSystemCode = harmonizedSystemCode;
  }

  const normalizedWeightUnit = normalizeShopifyWeightUnit(weightUnit);
  if (typeof weightValue === 'number' && Number.isFinite(weightValue) && weightValue >= 0 && normalizedWeightUnit) {
    input.measurement = {
      weight: {
        value: weightValue,
        unit: normalizedWeightUnit
      }
    };
  }

  return Object.keys(input).length ? input : undefined;
};

const buildVariantOptionValues = (
  variant: ShopifyProductMutationPayload['variants'][number],
  options: ShopifyProductMutationPayload['options']
) => {
  const normalizedOptions = (options ?? []).filter((option) => option.name.trim() && option.values.length);
  if (!normalizedOptions.length) {
    return undefined;
  }

  const parts = variant.title.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== normalizedOptions.length) {
    return undefined;
  }

  return normalizedOptions.map((option, index) => ({
    optionName: option.name,
    name: parts[index] ?? option.values[0]
  }));
};

const buildShopifyVariantBulkInput = ({
  payload,
  variant,
  includeOptionValues,
  inventoryQuantities
}: {
  payload: ShopifyProductMutationPayload;
  variant: ShopifyProductMutationPayload['variants'][number];
  includeOptionValues: boolean;
  inventoryQuantities?: Array<{ locationId: string; availableQuantity: number }>;
}) => {
  const input: Record<string, unknown> = {
    price: variant.price,
    compareAtPrice: variant.compareAtPrice?.trim() || payload.compareAtPrice?.trim() || undefined,
    barcode: variant.barcode?.trim() || payload.barcode?.trim() || undefined,
    taxable: payload.chargeTax ?? true,
    inventoryPolicy: payload.continueSellingOutOfStock ? 'CONTINUE' : 'DENY',
    inventoryItem: buildShopifyInventoryItemInput({ payload, variant })
  };

  if (includeOptionValues) {
    input.optionValues = buildVariantOptionValues(variant, payload.options);
  }

  if (inventoryQuantities?.length) {
    input.inventoryQuantities = inventoryQuantities.map((entry) => ({
      locationId: entry.locationId,
      availableQuantity: entry.availableQuantity
    }));
  }

  return input;
};

const buildShopifyProductSetVariantInput = ({
  payload,
  variant,
  position
}: {
  payload: ShopifyProductMutationPayload;
  variant: ShopifyProductMutationPayload['variants'][number];
  position: number;
}) => {
  const normalizedOptions = getExplicitShopifyOptions(payload);
  return {
    barcode: variant.barcode?.trim() || payload.barcode?.trim() || undefined,
    compareAtPrice: variant.compareAtPrice?.trim() || payload.compareAtPrice?.trim() || undefined,
    inventoryItem: buildShopifyInventoryItemInput({ payload, variant }),
    inventoryPolicy: payload.continueSellingOutOfStock ? 'CONTINUE' : 'DENY',
    optionValues: buildVariantOptionValues(variant, normalizedOptions),
    position,
    price: variant.price,
    sku: variant.sku?.trim() || undefined,
    taxable: payload.chargeTax ?? true
  };
};

const buildShopifyProductSetInput = async ({
  userId,
  payload,
  categoryId,
  warnings
}: {
  userId: string;
  payload: ShopifyProductMutationPayload;
  categoryId: string | null;
  warnings: string[];
}) => {
  const { ids: collectionIds, missing: missingCollections } = await resolveShopifyCollectionIds(userId, payload.collections);
  for (const collection of missingCollections) {
    warnings.push(`Shopify collection "${collection}" was not found.`);
  }

  const normalizedOptions = getExplicitShopifyOptions(payload);

  return {
    input: {
      title: payload.title,
      descriptionHtml: payload.description,
      vendor: payload.vendor,
      productType: payload.productType,
      category: categoryId ?? undefined,
      handle: payload.seoHandle ?? payload.handle,
      collections: payload.collections === undefined ? undefined : collectionIds,
      templateSuffix: payload.themeTemplate === undefined ? undefined : normalizeShopifyTemplateSuffix(payload.themeTemplate),
      seo: payload.seoTitle || payload.seoDescription
        ? {
            title: payload.seoTitle?.trim() || undefined,
            description: payload.seoDescription?.trim() || undefined
          }
        : undefined,
      metafields: buildShopifyMetafieldInputs(payload.metafields),
      productOptions: normalizedOptions.length
        ? normalizedOptions.map((option, index) => ({
            name: option.name,
            position: index + 1,
            values: option.values.map((value) => ({ name: value }))
          }))
        : undefined,
      status: payload.status,
      tags: payload.tags ?? [],
      variants: normalizedOptions.length
        ? payload.variants.map((variant, index) =>
            buildShopifyProductSetVariantInput({
              payload: {
                ...payload,
                options: normalizedOptions
              },
              variant,
              position: index + 1
            })
          )
        : undefined
    }
  };
};

const syncProductSetToShopify = async ({
  userId,
  identifier,
  payload,
  warnings
}: {
  userId: string;
  identifier?: { id: string };
  payload: ShopifyProductMutationPayload;
  warnings: string[];
}) => {
  const categoryId = await resolveShopifyCategoryId(userId, payload.category);
  if (payload.category && !categoryId) {
    warnings.push(`Shopify category could not be matched for "${payload.category}".`);
  }

  const productSetPayload = await buildShopifyProductSetInput({
    userId,
    payload,
    categoryId,
    warnings
  });

  const { data } = await executeShopifyRequest<{
    productSet: { product: ShopifyProductNode | null; userErrors: Array<{ message: string }> };
  }>(
    userId,
    `
      mutation SyncProductSet($identifier: ProductSetIdentifiers, $input: ProductSetInput!, $synchronous: Boolean!) {
        productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
          product {
            ${productSelection}
          }
          userErrors { message }
        }
      }
    `,
    {
      identifier,
      input: productSetPayload.input,
      synchronous: true
    }
  );

  if (data.productSet.userErrors.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      data.productSet.userErrors[0]?.message ?? 'Shopify product sync failed'
    );
  }

  if (!data.productSet.product?.id) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Shopify product sync completed without returning a product');
  }

  return data.productSet.product;
};

const ensureShopifyInventoryActivated = async (userId: string, inventoryItemId: string, locationId: string) => {
  const { data } = await executeShopifyRequest<{
    inventoryActivate: {
      inventoryLevel: { id?: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    userId,
    `
      mutation ActivateInventoryItem($inventoryItemId: ID!, $locationId: ID!, $idempotencyKey: String!) {
        inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) @idempotent(key: $idempotencyKey) {
          inventoryLevel { id }
          userErrors { message }
        }
      }
    `,
    {
      inventoryItemId,
      locationId,
      idempotencyKey: createHash('sha256').update(`${inventoryItemId}:${locationId}`).digest('hex')
    }
  );

  const errorMessage = data.inventoryActivate.userErrors[0]?.message;
  if (!errorMessage) {
    return;
  }

  const lowered = errorMessage.toLowerCase();
  if (lowered.includes('already') || lowered.includes('stocked')) {
    return;
  }

  throw new ApiError(httpStatus.BAD_REQUEST, errorMessage);
};

const syncShopifyVariantInventory = async ({
  userId,
  product,
  payload,
  warnings
}: {
  userId: string;
  product: ShopifyProductNode;
  payload: ShopifyProductMutationPayload;
  warnings: string[];
}) => {
  const variants = product.variants?.nodes ?? [];
  if (!variants.length) {
    return;
  }

  const resolvedLocations = await resolveShopifyLocationsByName(userId, payload.stockLocations);
  for (const location of resolvedLocations) {
    if (!location.matched) {
      warnings.push(`Shopify location "${location.requested.name}" was not found, so inventory was not synced there.`);
    }
  }

  const matchedLocations = resolvedLocations.filter((location) => Boolean(location.matched));
  const trackedVariants = payload.variants.filter((variant) => {
    const shouldTrackInventory =
      typeof variant.trackInventory === 'boolean'
        ? variant.trackInventory
        : payload.inventoryTracked ?? true;
    return shouldTrackInventory;
  });

  const buildVariantLocationAllocations = () => {
    if (!matchedLocations.length || !trackedVariants.length) {
      return new Map<string, Array<{ locationId: string; quantity: number }>>();
    }

    const locationTargets = matchedLocations.map((location) => ({
      locationId: location.matched!.id,
      remaining: inventoryUtils.coerceNonNegativeNumber(location.requested.available)
    }));
    const totalLocationQuantity = locationTargets.reduce((acc, location) => acc + location.remaining, 0);
    const totalVariantQuantity = trackedVariants.reduce(
      (acc, variant) => acc + inventoryUtils.coerceNonNegativeNumber(variant.inventoryQuantity ?? 0),
      0
    );

    if (totalLocationQuantity !== totalVariantQuantity) {
      warnings.push(
        `Variant inventory total (${totalVariantQuantity}) did not match location total (${totalLocationQuantity}). Shopify inventory was synced from variant totals to the primary location.`
      );
      return new Map<string, Array<{ locationId: string; quantity: number }>>();
    }

    const allocations = new Map<string, Array<{ locationId: string; quantity: number }>>();
    const remainingLocations = locationTargets.map((location) => ({ ...location }));

    trackedVariants.forEach((variant, variantIndex) => {
      const variantTotal = inventoryUtils.coerceNonNegativeNumber(variant.inventoryQuantity ?? 0);
      const perLocation: Array<{ locationId: string; quantity: number }> = [];

      if (variantIndex === trackedVariants.length - 1) {
        for (const location of remainingLocations) {
          perLocation.push({ locationId: location.locationId, quantity: location.remaining });
          location.remaining = 0;
        }
        allocations.set(variant.title, perLocation);
        return;
      }

      const remainingPool = remainingLocations.reduce((acc, location) => acc + location.remaining, 0);
      let assigned = 0;
      const provisional = remainingLocations.map((location) => {
        if (remainingPool === 0 || variantTotal === 0) {
          return { locationId: location.locationId, quantity: 0, remainder: 0 };
        }

        const exact = (variantTotal * location.remaining) / remainingPool;
        const quantity = Math.min(location.remaining, Math.floor(exact));
        assigned += quantity;
        return {
          locationId: location.locationId,
          quantity,
          remainder: exact - Math.floor(exact)
        };
      });

      let remainderToAssign = variantTotal - assigned;
      const byRemainder = [...provisional].sort((a, b) => b.remainder - a.remainder);
      for (const item of byRemainder) {
        if (remainderToAssign <= 0) {
          break;
        }

        const location = remainingLocations.find((entry) => entry.locationId === item.locationId);
        if (!location) {
          continue;
        }

        const headroom = location.remaining - item.quantity;
        if (headroom <= 0) {
          continue;
        }

        const increment = Math.min(headroom, remainderToAssign);
        item.quantity += increment;
        remainderToAssign -= increment;
      }

      for (const item of provisional) {
        const location = remainingLocations.find((entry) => entry.locationId === item.locationId);
        if (!location) {
          continue;
        }
        location.remaining -= item.quantity;
        perLocation.push({ locationId: item.locationId, quantity: item.quantity });
      }

      allocations.set(variant.title, perLocation);
    });

    return allocations;
  };

  const variantLocationAllocations = buildVariantLocationAllocations();

  for (const variant of payload.variants) {
    const shouldTrackInventory =
      typeof variant.trackInventory === 'boolean'
        ? variant.trackInventory
        : payload.inventoryTracked ?? true;
    if (!shouldTrackInventory) {
      continue;
    }

    const productVariant = variants.find((entry) => entry.title === variant.title);
    const inventoryItemId = productVariant?.inventoryItem?.id;
    if (!productVariant?.id || !inventoryItemId) {
      warnings.push(`Shopify variant "${variant.title}" could not be matched after sync.`);
      continue;
    }

    const exactAllocations = variantLocationAllocations.get(variant.title);
    if (exactAllocations?.length) {
      for (const allocation of exactAllocations) {
        try {
          await ensureShopifyInventoryActivated(userId, inventoryItemId, allocation.locationId);
          await shopifyService.updateInventoryQuantity(userId, inventoryItemId, {
            locationId: allocation.locationId,
            quantity: allocation.quantity
          });
        } catch (error) {
          warnings.push(
            `Inventory for variant "${variant.title}" was not synced exactly across locations: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
      continue;
    }

    if (matchedLocations.length) {
      const primaryMatchedLocation = matchedLocations[0]!;
      try {
        await ensureShopifyInventoryActivated(userId, inventoryItemId, primaryMatchedLocation.matched!.id);
        await shopifyService.updateInventoryQuantity(userId, inventoryItemId, {
          locationId: primaryMatchedLocation.matched!.id,
          quantity: inventoryUtils.coerceNonNegativeNumber(variant.inventoryQuantity ?? 0)
        });
      } catch (error) {
        warnings.push(
          `Inventory for variant "${variant.title}" at "${primaryMatchedLocation.requested.name}" was not synced: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      for (const location of resolvedLocations) {
        if (location.matched) {
          continue;
        }
        warnings.push(`Shopify location "${location.requested.name}" was not found, so it could not receive inventory.`);
      }
      continue;
    }

    const fallbackLocation = await getPrimaryShopifyLocation(userId);
    if (!fallbackLocation) {
      warnings.push(`No Shopify location was available to sync inventory for variant "${variant.title}".`);
      continue;
    }

    try {
      await ensureShopifyInventoryActivated(userId, inventoryItemId, fallbackLocation.id);
      await shopifyService.updateInventoryQuantity(userId, inventoryItemId, {
        locationId: fallbackLocation.id,
        quantity: inventoryUtils.coerceNonNegativeNumber(variant.inventoryQuantity ?? 0)
      });
    } catch (error) {
      warnings.push(
        `Inventory for variant "${variant.title}" was not synced to "${fallbackLocation.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
};

const syncShopifyVariants = async ({
  userId,
  productId,
  payload,
  warnings
}: {
  userId: string;
  productId: string;
  payload: ShopifyProductMutationPayload;
  warnings: string[];
}) => {
  const desiredVariants = payload.variants;
  if (!desiredVariants.length) {
    return fetchShopifyProductById(userId, productId);
  }

  const currentProduct = await fetchShopifyProductById(userId, productId);
  const currentVariants = currentProduct.variants?.nodes ?? [];
  const currentByTitle = new Map(currentVariants.map((variant) => [variant.title, variant]));
  const desiredTitles = new Set(desiredVariants.map((variant) => variant.title));

  const variantsToUpdate = desiredVariants
    .map((variant) => {
      const existing = currentByTitle.get(variant.title);
      if (!existing?.id) {
        return null;
      }

      return {
        id: existing.id,
        ...buildShopifyVariantBulkInput({
          payload,
          variant,
          includeOptionValues: Boolean(payload.options?.length)
        })
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (variantsToUpdate.length) {
    const { data } = await executeShopifyRequest<{
      productVariantsBulkUpdate: {
        productVariants: Array<{ id: string }>;
        userErrors: Array<{ message: string }>;
      };
    }>(
      userId,
      `
        mutation BulkUpdateProductVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { message }
          }
        }
      `,
      {
        productId,
        variants: variantsToUpdate
      }
    );

    if (data.productVariantsBulkUpdate.userErrors.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        data.productVariantsBulkUpdate.userErrors[0]?.message ?? 'Shopify variant update failed'
      );
    }
  }

  const variantsToCreate = desiredVariants.filter((variant) => !currentByTitle.has(variant.title));
  if (variantsToCreate.length) {
    const inventoryLocations = await resolveShopifyLocationsByName(userId, payload.stockLocations);
    const fallbackLocation = await getPrimaryShopifyLocation(userId);
    const createInputs = variantsToCreate.map((variant) => {
      const inventoryQuantities = inventoryLocations.length
        ? inventoryLocations
            .filter((entry) => Boolean(entry.matched))
            .map((entry) => ({
              locationId: entry.matched!.id,
              availableQuantity: inventoryUtils.coerceNonNegativeNumber(entry.requested.available)
            }))
        : fallbackLocation
          ? [{
              locationId: fallbackLocation.id,
              availableQuantity: inventoryUtils.coerceNonNegativeNumber(variant.inventoryQuantity ?? 0)
            }]
          : undefined;

      return buildShopifyVariantBulkInput({
        payload,
        variant,
        includeOptionValues: Boolean(payload.options?.length),
        inventoryQuantities
      });
    });

    const { data } = await executeShopifyRequest<{
      productVariantsBulkCreate: {
        productVariants: Array<{ id: string }>;
        userErrors: Array<{ message: string }>;
      };
    }>(
      userId,
      `
        mutation BulkCreateProductVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
            productVariants { id }
            userErrors { message }
          }
        }
      `,
      {
        productId,
        variants: createInputs
      }
    );

    if (data.productVariantsBulkCreate.userErrors.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        data.productVariantsBulkCreate.userErrors[0]?.message ?? 'Shopify variant creation failed'
      );
    }
  }

  const variantsToDelete = currentVariants
    .filter((variant) => !desiredTitles.has(variant.title))
    .map((variant) => variant.id);

  if (variantsToDelete.length) {
    const { data } = await executeShopifyRequest<{
      productVariantsBulkDelete: {
        product: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      userId,
      `
        mutation BulkDeleteProductVariants($productId: ID!, $variantsIds: [ID!]!) {
          productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
            product { id }
            userErrors { message }
          }
        }
      `,
      {
        productId,
        variantsIds: variantsToDelete
      }
    );

    if (data.productVariantsBulkDelete.userErrors.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        data.productVariantsBulkDelete.userErrors[0]?.message ?? 'Shopify variant deletion failed'
      );
    }
  }

  let syncedProduct = await fetchShopifyProductById(userId, productId);
  await syncShopifyVariantInventory({ userId, product: syncedProduct, payload, warnings });
  syncedProduct = await fetchShopifyProductById(userId, productId);
  return syncedProduct;
};

const getStoredShopifyScopes = async (userId: string) => {
  const connection = await marketplaceConnectionService.getShopifyConnection(userId);
  if (!connection?.scopes?.length) {
    return null;
  }

  return new Set(connection.scopes.map((scope) => scope.trim()).filter(Boolean));
};

const hasEffectiveShopifyScope = (scopes: Set<string>, scope: string) => {
  if (scopes.has(scope)) {
    return true;
  }

  if (scope.startsWith('read_')) {
    return scopes.has(`write_${scope.slice('read_'.length)}`);
  }

  return false;
};

const hasDisputeScopeHints = (scopes: Set<string> | null) => {
  if (!scopes) {
    return false;
  }

  return SHOPIFY_DISPUTE_SCOPE_HINTS.some((scope) => scopes.has(scope));
};

const getSafeShopifyDisputeErrorDetails = (error: unknown) => {
  if (error instanceof ApiError) {
    return {
      provider: 'shopify' as const,
      operation: 'disputes' as const,
      statusCode: error.statusCode,
      errorMessage: error.message
    };
  }

  if (error instanceof Error) {
    return {
      provider: 'shopify' as const,
      operation: 'disputes' as const,
      errorMessage: error.message
    };
  }

  return {
    provider: 'shopify' as const,
    operation: 'disputes' as const
  };
};

const normalizeDisputeStatus = (value: unknown) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'NEEDS_RESPONSE' || normalized.includes('OPEN')) {
    return 'OPEN';
  }
  if (normalized === 'UNDER_REVIEW' || normalized.includes('SUBMITTED')) {
    return 'SUBMITTED';
  }
  if (normalized.includes('WON')) {
    return 'WON';
  }
  if (normalized === 'ACCEPTED' || normalized === 'CHARGE_REFUNDED' || normalized === 'PREVENTED' || normalized.includes('LOST')) {
    return 'LOST';
  }

  return 'UNKNOWN';
};

const mapShopifyDisputeToLocalDispute = async (userId: string, dispute: ShopifyPaymentsDisputeNode) => {
  const shopifyOrderId = dispute.order?.id;
  const relatedOrder = shopifyOrderId
    ? await OrderModel.findOne({ userId, shopifyOrderId }).select('_id orderName shopifyOrderId customerName email currency').lean()
    : null;

  return {
    userId,
    marketplace: 'shopify' as const,
    localOrderId: relatedOrder?._id ?? null,
    shopifyOrderId: shopifyOrderId ?? relatedOrder?.shopifyOrderId ?? '',
    orderName: dispute.order?.name ?? relatedOrder?.orderName ?? '',
    customerName:
      [dispute.order?.customer?.firstName, dispute.order?.customer?.lastName].filter(Boolean).join(' ')
      || relatedOrder?.customerName
      || '',
    customerEmail: dispute.order?.email ?? relatedOrder?.email ?? '',
    disputeId: dispute.id ?? '',
    status: normalizeDisputeStatus(dispute.status),
    reason: dispute.reasonDetails?.reason?.trim() || dispute.reasonDetails?.networkReasonCode?.trim() || dispute.type?.trim() || 'Unknown dispute reason',
    amount: dispute.amount?.amount?.trim() || undefined,
    currency: dispute.amount?.currencyCode?.trim() || relatedOrder?.currency || undefined,
    deadline: dispute.evidenceDueBy ? new Date(dispute.evidenceDueBy) : undefined,
    evidenceStatus: undefined,
    sourceCreatedAt: dispute.initiatedAt ? new Date(dispute.initiatedAt) : undefined,
    sourceUpdatedAt: (dispute.finalizedOn ?? dispute.initiatedAt) ? new Date(dispute.finalizedOn ?? dispute.initiatedAt ?? '') : undefined,
    rawShopifyData: dispute,
    lastSyncedAt: new Date()
  };
};

const canManageShopifyPublications = async (userId: string, shouldPublish: boolean) => {
  const scopes = await getStoredShopifyScopes(userId);
  if (!scopes) {
    return { allowed: true, missingScopes: [] as string[] };
  }

  const requiredScopes = shouldPublish
    ? ['read_publications', 'write_publications']
    : ['read_publications'];
  const missingScopes = requiredScopes.filter((scope) => !hasEffectiveShopifyScope(scopes, scope));

  return {
    allowed: missingScopes.length === 0,
    missingScopes
  };
};

const syncPrimaryVariantDetails = async (
  userId: string,
  product: ShopifyProductNode,
  payload: ShopifyProductMutationPayload,
  primaryVariant: ShopifyProductMutationPayload['variants'][0] | undefined,
  warnings: string[]
) => {
  const createdVariant = product.variants?.nodes?.[0];
  if (!createdVariant || !primaryVariant) {
    return;
  }

  if (primaryVariant.price || primaryVariant.compareAtPrice || primaryVariant.barcode || primaryVariant.trackInventory !== undefined) {
    try {
      const { data } = await executeShopifyRequest<{
        productVariantsBulkUpdate: {
          productVariants: Array<{ id: string }>;
          userErrors: Array<{ message: string }>;
        };
      }>(
        userId,
        `
          mutation UpdateDefaultVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants { id }
              userErrors { message }
            }
          }
        `,
        {
          productId: product.id,
          variants: [{
            id: createdVariant.id,
            price: primaryVariant.price,
            compareAtPrice: primaryVariant.compareAtPrice?.trim() || undefined,
            barcode: primaryVariant.barcode?.trim() || undefined,
            taxable: true,
            inventoryPolicy: primaryVariant.trackInventory === false ? 'DENY' : undefined
          }]
        }
      );

      if (data.productVariantsBulkUpdate.userErrors.length) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          data.productVariantsBulkUpdate.userErrors[0]?.message ?? 'Shopify default variant update failed'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown default variant update failure';
      warnings.push(`Default variant fields were not updated: ${message}`);
      logger.warn(
        {
          userId,
          shopifyProductId: product.id,
          shopifyVariantId: createdVariant.id,
          message
        },
        'Shopify product mutation completed but default variant update failed'
      );
    }
  }

  const inventoryItemInput = createdVariant.inventoryItem?.id
    ? buildShopifyInventoryItemInput({
        payload,
        variant: primaryVariant
      })
    : undefined;

  if (createdVariant.inventoryItem?.id && inventoryItemInput) {
    try {
      await updateShopifyInventoryItem(userId, createdVariant.inventoryItem.id, inventoryItemInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown inventory item update failure';
      warnings.push(`Default variant inventory fields were not updated: ${message}`);
      logger.warn(
        {
          userId,
          shopifyProductId: product.id,
          inventoryItemId: createdVariant.inventoryItem.id,
          message
        },
        'Shopify product mutation completed but default inventory item update failed'
      );
    }
  }
};

const syncShopifyProductImage = async (
  userId: string,
  product: ShopifyProductNode,
  imagePath: string | undefined,
  title: string,
  warnings: string[]
) => {
  if (!imagePath) {
    warnings.push('No generated Shopify image was provided, so the product was uploaded without media.');
    return { imageUploaded: false, product };
  }

  const imageMarker = buildShopifyImageMarker(imagePath);
  if (product.media?.nodes?.some((node) => node.alt === imageMarker)) {
    return { imageUploaded: true, product };
  }

  const originalSource = getPublicShopifyImageUrl(imagePath);
  if (!originalSource) {
    warnings.push('Shopify image upload was skipped because SHOPIFY_APP_URL is not configured.');
    return { imageUploaded: false, product };
  }

  try {
    const { data } = await executeShopifyRequest<{
      productUpdate: { product: ShopifyProductNode; userErrors: Array<{ message: string }> };
    }>(
      userId,
      `
        mutation AddShopifyProductImage($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
          productUpdate(product: $product, media: $media) {
            product {
              ${productSelection}
            }
            userErrors { message }
          }
        }
      `,
      {
        product: { id: product.id },
        media: [
          {
            alt: imageMarker,
            mediaContentType: 'IMAGE',
            originalSource
          }
        ]
      }
    );

    if (data.productUpdate.userErrors.length) {
      warnings.push(data.productUpdate.userErrors[0]?.message ?? 'Shopify image upload failed.');
      return { imageUploaded: false, product };
    }

    return { imageUploaded: true, product: data.productUpdate.product };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Shopify image upload failure';
    warnings.push(`Shopify image upload was skipped: ${message}`);
    logger.warn(
      {
        userId,
        shopifyProductId: product.id,
        title,
        imagePath,
        message
      },
      'Shopify product mutation completed but media upload failed'
    );
    return { imageUploaded: false, product };
  }
};

const getOnlineStorePublicationId = async (userId: string) => {
  const { data } = await executeShopifyRequest<{
    publications: {
      edges: Array<{ node: { id: string; name?: string } }>;
    };
  }>(
    userId,
    `
      query GetPublications {
        publications(first: 20) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `
  );

  const publications = data.publications.edges.map((edge) => edge.node);
  const onlineStorePublication = publications.find((publication) => publication.name?.toLowerCase().includes('online store'));

  return onlineStorePublication?.id ?? publications[0]?.id ?? null;
};

const syncShopifyPublicationState = async (
  userId: string,
  shopifyProductId: string,
  shouldPublish: boolean,
  warnings: string[]
) => {
  const publicationAccess = await canManageShopifyPublications(userId, shouldPublish);
  if (!publicationAccess.allowed) {
    if (shouldPublish) {
      warnings.push(
        `Online Store publishing is unavailable for the current Shopify connection. Reconnect Shopify to grant: ${publicationAccess.missingScopes.join(', ')}.`
      );
    }

    return false;
  }

  try {
    const publicationId = await getOnlineStorePublicationId(userId);
    if (!publicationId) {
      warnings.push('No Shopify publication was found for the connected store.');
      return false;
    }

    if (shouldPublish) {
      const { data } = await executeShopifyRequest<{
        publishablePublish: { userErrors: Array<{ message: string }> };
      }>(
        userId,
        `
          mutation PublishProductToOnlineStore($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              userErrors { message }
            }
          }
        `,
        {
          id: shopifyProductId,
          input: [{ publicationId }]
        }
      );

      if (data.publishablePublish.userErrors.length) {
        warnings.push(data.publishablePublish.userErrors[0]?.message ?? 'Shopify Online Store publish failed.');
        return false;
      }

      return true;
    }

    const { data } = await executeShopifyRequest<{
      publishableUnpublish: { userErrors: Array<{ message: string }> };
    }>(
      userId,
      `
        mutation UnpublishProductFromOnlineStore($id: ID!, $input: [PublicationInput!]!) {
          publishableUnpublish(id: $id, input: $input) {
            userErrors { message }
          }
        }
      `,
      {
        id: shopifyProductId,
        input: [{ publicationId }]
      }
    );

    if (data.publishableUnpublish.userErrors.length) {
      warnings.push(data.publishableUnpublish.userErrors[0]?.message ?? 'Shopify Online Store unpublish failed.');
      return false;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Shopify publication sync failure';
    warnings.push(`Online Store publish state could not be changed: ${message}`);
    logger.warn(
      {
        userId,
        shopifyProductId,
        shouldPublish,
        message
      },
      'Shopify publication sync failed'
    );
    return false;
  }
};

const requireOAuthConfig = () => {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_REDIRECT_URI) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify OAuth environment variables are not fully configured');
  }
};

export const shopifyService = {
  async getProductImageProxy(imagePath: string) {
    if (!imagePath) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Missing Shopify product image path');
    }

    const upstreamUrl = isHttpUrl(imagePath) ? imagePath : getFrontendImageProxyUrl(imagePath);
    if (!upstreamUrl) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'FRONTEND_URL is not configured for Shopify image proxying');
    }

    const response = await fetch(upstreamUrl, {
      headers: isHttpUrl(imagePath)
        ? undefined
        : {
            'ngrok-skip-browser-warning': 'true'
          }
    });

    if (!response.ok) {
      throw new ApiError(httpStatus.BAD_GATEWAY, 'Could not load the generated Shopify image');
    }

    return {
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      payload: Buffer.from(await response.arrayBuffer())
    };
  },

  async getConnectionState(userId: string) {
    const connection = await marketplaceConnectionService.getShopifyConnection(userId);
    if (connection?.accessTokenEncrypted) {
      return connection.status;
    }

    if (connection) {
      return 'not_connected';
    }

    return env.SHOPIFY_SHOP_DOMAIN && isConfiguredShopifyFallbackToken(env.SHOPIFY_ADMIN_ACCESS_TOKEN)
      ? 'fallback_configured'
      : 'not_connected';
  },

  async createShopifyConnectUrl(userId: string) {
    requireOAuthConfig();

    const state = createOAuthState(userId);
    const url = new URL(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/oauth/authorize`);
    url.searchParams.set('client_id', env.SHOPIFY_CLIENT_ID!);
    url.searchParams.set('scope', SHOPIFY_SCOPES);
    url.searchParams.set('redirect_uri', env.SHOPIFY_REDIRECT_URI!);
    url.searchParams.set('state', state);

    return url.toString();
  },

  async getConnectUrl(userId: string) {
    return this.createShopifyConnectUrl(userId);
  },

  async handleOAuthCallback(req: Request, res: Response) {
    try {
      const shop = getSingleQueryValue(req.query.shop).toLowerCase();
      const code = getSingleQueryValue(req.query.code);
      const state = getSingleQueryValue(req.query.state);

      if (!shop || !code || !state || !getSingleQueryValue(req.query.hmac)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required Shopify OAuth callback parameters');
      }

      if (!isValidShopifyHmac(req)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify callback HMAC validation failed');
      }

      const userId = consumeOAuthState(state);
      const { accessToken, scopes } = await exchangeOAuthCodeForToken(shop, code);
      const encryptedToken = encryptionUtils.encrypt(accessToken);

      await marketplaceConnectionService.upsertShopifyConnection({
        userId,
        shopDomain: shop,
        accessTokenEncrypted: encryptedToken,
        scopes,
        status: 'connected',
        connectedAt: new Date(),
        disconnectedAt: undefined,
        lastCheckedAt: new Date()
      });

      const redirectUrl = buildFrontendRedirectUrl('/integration', {
        marketplace: 'shopify',
        status: 'connected',
        shop
      });

      if (redirectUrl) {
        res.redirect(redirectUrl);
        return;
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Shopify store connected successfully',
        data: {
          marketplace: 'shopify',
          shopDomain: shop,
          status: 'connected',
          scopes
        }
      });
    } catch (error) {
      const safeMessage = error instanceof ApiError ? error.message : 'Shopify connection failed';
      const redirectUrl = buildFrontendRedirectUrl('/integration', {
        marketplace: 'shopify',
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

  async disconnect(userId: string) {
    const connection = await marketplaceConnectionService.markShopifyDisconnected(userId);
    return marketplaceConnectionService.toSafeConnection(connection);
  },

  async getStatus(userId: string) {
    const connection = await marketplaceConnectionService.getShopifyConnection(userId);
    const baseConnection = connection ? marketplaceConnectionService.toSafeConnection(connection) : null;

    try {
      const { access, data } = await executeShopifyRequest<{ shop: { name: string; email: string; myshopifyDomain: string } }>(
        userId,
        `query { shop { name email myshopifyDomain } }`
      );

      return {
        connected: true,
        source: access.source,
        shop: data.shop,
        connection: baseConnection
      };
    } catch (error) {
      if (connection) {
        await marketplaceConnectionService.markShopifyChecked(userId, 'error');
      }

      if (error instanceof ApiError && error.message === 'Shopify store is not connected.') {
        return {
          connected: false,
          source: 'none',
          shop: null,
          connection: baseConnection
        };
      }

      if (!connection && error instanceof ApiError) {
        return {
          connected: false,
          source: 'none',
          shop: null,
          connection: null
        };
      }

      throw error;
    }
  },

  async getShop(userId: string) {
    const { data } = await executeShopifyRequest<{
      shop: { id: string; name: string; email: string; myshopifyDomain: string; currencyCode: string; plan: { displayName: string } };
    }>(userId, `query { shop { id name email myshopifyDomain currencyCode plan { displayName } } }`);

    return data.shop;
  },

  async getProducts(userId: string) {
    const { data } = await executeShopifyRequest<{ products: { nodes: ShopifyProductNode[] } }>(userId, productsQuery);
    return data.products.nodes;
  },

  async importProducts(userId: string) {
    const products = await this.getProducts(userId);
    const fallbackLocation = await getPrimaryShopifyLocation(userId);
    let importedCount = 0;
    let updatedCount = 0;
    const liveInventoryKeys = new Set<string>();

    for (const productNode of products) {
      const { localProduct, wasCreated } = await upsertLocalShopifyProduct(userId, productNode);
      if (wasCreated) {
        importedCount += 1;
      } else {
        updatedCount += 1;
      }

      const inventorySyncResult = await syncInventoryRowsFromShopifyProduct({
        userId,
        localProduct,
        shopifyProduct: productNode,
        fallbackLocation
      });

      for (const liveKey of inventorySyncResult.liveKeys) {
        liveInventoryKeys.add(liveKey);
      }
    }

    const { staleMarkedInactiveCount } = await inventoryService.reconcileInventoryRowsForUser(userId, [...liveInventoryKeys]);
    const activeCount = await InventoryModel.countDocuments({ userId, isActive: { $ne: false } });

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'product',
      action: 'import-products',
      status: 'success',
      message: `Imported ${products.length} Shopify products`
    });

    return {
      count: products.length,
      importedCount,
      updatedCount,
      staleMarkedInactiveCount,
      activeCount
    };
  },

  async createProduct(userId: string, payload: ShopifyProductMutationPayload): Promise<ShopifyProductMutationResult> {
    const warnings: string[] = [];
    const explicitOptions = getExplicitShopifyOptions(payload);
    let finalProduct = await syncProductSetToShopify({
      userId,
      payload,
      warnings
    });
    if (!explicitOptions.length) {
      await syncPrimaryVariantDetails(userId, finalProduct, payload, payload.variants[0], warnings);
      finalProduct = await fetchShopifyProductById(userId, finalProduct.id);
    }
    await syncShopifyVariantInventory({ userId, product: finalProduct, payload, warnings });
    finalProduct = await fetchShopifyProductById(userId, finalProduct.id);
    const imageSyncResult = await syncShopifyProductImage(userId, finalProduct, payload.imagePath, payload.title, warnings);
    finalProduct = imageSyncResult.product;
    const shouldPublishToOnlineStore = payload.status === 'ACTIVE' && payload.publishToOnlineStore === true;
    const publishedToOnlineStore = shouldPublishToOnlineStore
      ? await syncShopifyPublicationState(userId, finalProduct.id, true, warnings)
      : false;
    const { mapped, localProduct } = await upsertLocalShopifyProduct(userId, finalProduct);
    const fallbackLocation = await getPrimaryShopifyLocation(userId);
    const inventoryRowsSynced = await syncInventoryRowsFromShopifyProduct({
      userId,
      localProduct,
      shopifyProduct: finalProduct,
      fallbackLocation
    });

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'product',
      entityId: mapped.shopifyProductId,
      action: 'create-product',
      status: 'success',
      message: 'Created Shopify product successfully'
    });

    return {
      imageUploaded: imageSyncResult.imageUploaded,
      product: finalProduct,
      publishedToOnlineStore,
      warnings: inventoryRowsSynced.syncedCount > 0 ? warnings : [...warnings, 'Local inventory rows could not be derived for this product.']
    };
  },

  async updateProduct(userId: string, shopifyProductId: string, payload: Partial<ShopifyProductMutationPayload>): Promise<ShopifyProductMutationResult> {
    const warnings: string[] = [];
    const currentProduct = await fetchShopifyProductById(userId, shopifyProductId);
    const mergedPayload: ShopifyProductMutationPayload = {
      title: payload.title ?? currentProduct.title,
      description: payload.description ?? currentProduct.descriptionHtml,
      vendor: payload.vendor ?? currentProduct.vendor,
      productType: payload.productType ?? currentProduct.productType,
      category: payload.category,
      handle: payload.handle ?? currentProduct.handle,
      status: payload.status ?? currentProduct.status,
      tags: payload.tags ?? currentProduct.tags ?? [],
      imagePath: payload.imagePath,
      publishToOnlineStore: payload.publishToOnlineStore,
      compareAtPrice: payload.compareAtPrice,
      costPerItem: payload.costPerItem,
      chargeTax: payload.chargeTax,
      barcode: payload.barcode,
      inventoryTracked: payload.inventoryTracked,
      continueSellingOutOfStock: payload.continueSellingOutOfStock,
      stockLocations: payload.stockLocations,
      physicalProduct: payload.physicalProduct,
      weight: payload.weight,
      weightUnit: payload.weightUnit,
      countryOfOrigin: payload.countryOfOrigin,
      hsCode: payload.hsCode,
      collections: payload.collections,
      themeTemplate: payload.themeTemplate,
      seoTitle: payload.seoTitle,
      seoDescription: payload.seoDescription,
      seoHandle: payload.seoHandle,
      metafields: payload.metafields,
      options: payload.options,
      variants: payload.variants ?? (currentProduct.variants?.nodes ?? []).map((variant) => ({
        title: variant.title,
        price: variant.price ?? '0',
        sku: variant.sku,
        inventoryQuantity: variant.inventoryQuantity ?? 0,
        trackInventory: variant.inventoryItem?.tracked ?? true,
        barcode: variant.barcode,
        compareAtPrice: variant.compareAtPrice
      }))
    };
    const explicitOptions = getExplicitShopifyOptions(mergedPayload);

    let finalProduct = await syncProductSetToShopify({
      userId,
      identifier: { id: shopifyProductId },
      payload: mergedPayload,
      warnings
    });
    if (!explicitOptions.length) {
      await syncPrimaryVariantDetails(userId, finalProduct, mergedPayload, mergedPayload.variants[0], warnings);
      finalProduct = await fetchShopifyProductById(userId, finalProduct.id);
    }
    await syncShopifyVariantInventory({ userId, product: finalProduct, payload: mergedPayload, warnings });
    finalProduct = await fetchShopifyProductById(userId, finalProduct.id);
    const imageSyncResult = await syncShopifyProductImage(
      userId,
      finalProduct,
      payload.imagePath,
      payload.title ?? finalProduct.title,
      warnings
    );
    finalProduct = imageSyncResult.product;

    const publishedToOnlineStore =
      typeof payload.publishToOnlineStore === 'boolean'
        ? await syncShopifyPublicationState(
            userId,
            shopifyProductId,
            payload.status === 'ACTIVE' && payload.publishToOnlineStore,
            warnings
          )
        : false;

    const { localProduct } = await upsertLocalShopifyProduct(userId, finalProduct);
    const fallbackLocation = await getPrimaryShopifyLocation(userId);
    await syncInventoryRowsFromShopifyProduct({
      userId,
      localProduct,
      shopifyProduct: finalProduct,
      fallbackLocation
    });

    await marketplaceConnectionService.markShopifySynced(userId);
    return {
      imageUploaded: imageSyncResult.imageUploaded,
      product: finalProduct,
      publishedToOnlineStore,
      warnings
    };
  },

  async updateProductPrice(userId: string, shopifyProductId: string, payload: { variantId: string; price: string; compareAtPrice?: string }) {
    const { data } = await executeShopifyRequest<{
      productVariantsBulkUpdate: { productVariants: Array<{ id: string; price?: string; compareAtPrice?: string }>; userErrors: Array<{ message: string }> };
    }>(userId,
      `
      mutation UpdateProductPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            compareAtPrice
          }
          userErrors { message }
        }
      }
    `,
      {
        productId: shopifyProductId,
        variants: [{ id: payload.variantId, price: payload.price, compareAtPrice: payload.compareAtPrice }]
      });

    if (data.productVariantsBulkUpdate.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.productVariantsBulkUpdate.userErrors[0]?.message ?? 'Shopify price update failed');
    }

    await ProductModel.updateOne(
      { userId, shopifyProductId, 'variants.shopifyVariantId': payload.variantId },
      {
        $set: {
          'variants.$.price': payload.price,
          'variants.$.compareAtPrice': payload.compareAtPrice ?? null,
          lastSyncedAt: new Date()
        }
      }
    );

    await marketplaceConnectionService.markShopifySynced(userId);
    return data.productVariantsBulkUpdate.productVariants[0];
  },

  async markOrderAsShipped(userId: string, shopifyOrderId: string, payload: ShopifyShipmentPayload) {
    const { data: fulfillmentOrderData } = await executeShopifyRequest<{
      order: { fulfillmentOrders: { nodes: ShopifyFulfillmentOrderNode[] } } | null;
    }>(userId, fulfillmentOrdersQuery, { id: shopifyOrderId });

    const fulfillmentOrders = fulfillmentOrderData.order?.fulfillmentOrders.nodes ?? [];
    const fulfillableOrders = fulfillmentOrders.filter((fulfillmentOrder) => {
      const status = fulfillmentOrder.status?.toUpperCase();
      const supportsCreate = fulfillmentOrder.supportedActions?.some((action) => action.action === 'CREATE_FULFILLMENT');
      const hasRemainingItems = (fulfillmentOrder.lineItems?.nodes ?? []).some((lineItem) => (lineItem.remainingQuantity ?? 0) > 0);

      return status !== 'CLOSED' && supportsCreate && hasRemainingItems;
    });

    if (!fulfillableOrders.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No fulfillable Shopify fulfillment orders were found for this order');
    }

    const lineItemsByFulfillmentOrder = fulfillableOrders.map((fulfillmentOrder) => ({
      fulfillmentOrderId: fulfillmentOrder.id,
      fulfillmentOrderLineItems: (fulfillmentOrder.lineItems?.nodes ?? [])
        .filter((lineItem) => (lineItem.remainingQuantity ?? 0) > 0)
        .map((lineItem) => ({
          id: lineItem.id,
          quantity: lineItem.remainingQuantity ?? 0
        }))
    }));

    const { data } = await executeShopifyRequest<{
      fulfillmentCreate: {
        fulfillment: { id: string; status?: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      userId,
      `
        mutation CreateFulfillment($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment {
              id
              status
            }
            userErrors { message }
          }
        }
      `,
      {
        fulfillment: {
          lineItemsByFulfillmentOrder,
          notifyCustomer: payload.notifyCustomer ?? true,
          trackingInfo: {
            company: payload.carrier,
            number: payload.trackingNumber,
            url: payload.trackingUrl
          }
        }
      }
    );

    if (data.fulfillmentCreate.userErrors.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        data.fulfillmentCreate.userErrors[0]?.message ?? 'Shopify fulfillment creation failed'
      );
    }

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'order',
      entityId: shopifyOrderId,
      action: 'mark-shipped',
      status: 'success',
      message: 'Marked Shopify order as shipped successfully'
    });

    return data.fulfillmentCreate.fulfillment;
  },

  async cancelOrder(userId: string, shopifyOrderId: string, payload: ShopifyOrderCancellationPayload) {
    const { data } = await executeShopifyRequest<{
      orderCancel: {
        job: { id: string } | null;
        orderCancelUserErrors: Array<{ message: string }>;
        userErrors: Array<{ message: string }>;
      };
    }>(
      userId,
      `
        mutation CancelOrder(
          $orderId: ID!
          $notifyCustomer: Boolean
          $reason: OrderCancelReason!
          $restock: Boolean!
          $refundMethod: OrderCancelRefundMethodInput
          $staffNote: String
        ) {
          orderCancel(
            orderId: $orderId
            notifyCustomer: $notifyCustomer
            reason: $reason
            restock: $restock
            refundMethod: $refundMethod
            staffNote: $staffNote
          ) {
            job {
              id
            }
            orderCancelUserErrors {
              message
            }
            userErrors {
              message
            }
          }
        }
      `,
      {
        orderId: shopifyOrderId,
        notifyCustomer: payload.notifyCustomer ?? false,
        reason: payload.reason,
        restock: payload.restock,
        refundMethod: payload.refund ? { originalPaymentMethodsRefund: true } : undefined,
        staffNote: payload.staffNote
      }
    );

    const userError =
      data.orderCancel.orderCancelUserErrors[0]?.message ??
      data.orderCancel.userErrors[0]?.message;

    if (userError) {
      throw new ApiError(httpStatus.BAD_REQUEST, userError);
    }

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'order',
      entityId: shopifyOrderId,
      action: 'cancel-order',
      status: 'success',
      message: 'Cancelled Shopify order successfully'
    });

    return data.orderCancel.job;
  },

  async getOrders(userId: string) {
    const { data } = await executeShopifyRequest<{ orders: { nodes: ShopifyOrderNode[] } }>(userId, ordersQuery);
    return data.orders.nodes;
  },

  async importOrders(userId: string) {
    const orders = await this.getOrders(userId);

    for (const orderNode of orders) {
      const mapped = shopifyMapper.toLocalOrder(userId, orderNode);
      await OrderModel.findOneAndUpdate(
        { userId, shopifyOrderId: mapped.shopifyOrderId },
        { $set: mapped },
        { upsert: true, new: true }
      );
    }

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'order',
      action: 'import-orders',
      status: 'success',
      message: `Imported ${orders.length} Shopify orders`
    });

    return { count: orders.length };
  },

  async importDisputes(userId: string): Promise<ShopifyDisputeImportResult> {
    const storedScopes = await getStoredShopifyScopes(userId);
    if (!hasDisputeScopeHints(storedScopes)) {
      return {
        success: false,
        reason: 'missing_scope',
        requiredScope: REQUIRED_SHOPIFY_DISPUTE_SCOPE,
        count: 0,
        message: 'Reconnect Shopify with dispute permissions.'
      };
    }

    try {
      const { data } = await executeShopifyRequest<{ disputes?: { nodes?: ShopifyPaymentsDisputeNode[] } }>(
        userId,
        shopifyPaymentsDisputesQuery
      );

      const disputes = data.disputes?.nodes ?? [];
      let count = 0;

      for (const dispute of disputes) {
        if (!dispute.id) {
          continue;
        }

        const mapped = await mapShopifyDisputeToLocalDispute(userId, dispute);
        await DisputeModel.findOneAndUpdate(
          { userId, marketplace: 'shopify', disputeId: mapped.disputeId },
          { $set: mapped },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        count += 1;
      }

      await marketplaceConnectionService.markShopifySynced(userId);
      await syncLogService.create({
        userId,
        entityType: 'order',
        action: 'import-disputes',
        status: 'success',
        message: `Imported ${count} Shopify disputes`
      });

      if (count === 0) {
        return {
          success: true,
          reason: 'no_disputes',
          count: 0,
          message: 'No Shopify disputes found.'
        };
      }

      return {
        success: true,
        reason: 'imported',
        count,
        message: 'Shopify disputes imported successfully.'
      };
    } catch (error) {
      const safeDetails = getSafeShopifyDisputeErrorDetails(error);
      logger.warn(
        {
          userId,
          ...safeDetails
        },
        'Shopify disputes import failed'
      );

      return {
        success: false,
        reason: 'shopify_api_error',
        count: 0,
        message: error instanceof ApiError ? error.message : 'Shopify disputes import failed.',
        details: safeDetails
      };
    }
  },

  async getLocations(userId: string) {
    const { data } = await executeShopifyRequest<{ locations: { nodes: Array<{ id: string; name: string; address?: { formatted?: string[] } }> } }>(
      userId,
      `query { locations(first: 20) { nodes { id name address { formatted } } } }`
    );

    return data.locations.nodes;
  },

  async getInventory(userId: string) {
    const products = await this.getProducts(userId);
    return products.flatMap((productNode) =>
      (productNode.variants?.nodes ?? []).flatMap((variant) => {
        if (!variant.inventoryItem?.id || variant.inventoryItem?.tracked === false) {
          return [];
        }

        const levels = variant.inventoryItem?.inventoryLevels?.nodes ?? [];
        if (!levels.length) {
          const quantity = inventoryUtils.coerceNonNegativeNumber(variant.inventoryQuantity ?? 0);
          return [{
            productId: productNode.id,
            productTitle: productNode.title,
            variantId: variant.id,
            variantTitle: variant.title,
            inventoryItemId: variant.inventoryItem?.id ?? '',
            sku: variant.sku ?? '',
            quantity,
            locationId: '',
            locationName: ''
          }];
        }

        return levels.map((level) => {
          const quantity = inventoryUtils.coerceNonNegativeNumber(level.quantities?.[0]?.quantity ?? variant.inventoryQuantity ?? 0);
          return {
            productId: productNode.id,
            productTitle: productNode.title,
            variantId: variant.id,
            variantTitle: variant.title,
            inventoryItemId: variant.inventoryItem?.id ?? '',
            sku: variant.sku ?? '',
            quantity,
            locationId: level.location?.id ?? '',
            locationName: level.location?.name ?? ''
          };
        });
      })
    );
  },

  async updateInventoryQuantity(userId: string, inventoryItemId: string, payload: { locationId: string; quantity: number }) {
    const currentQuantity = await fetchShopifyAvailableQuantity(userId, inventoryItemId, payload.locationId);
    const idempotencyKey = randomBytes(16).toString('hex');

    const { data } = await executeShopifyRequest<{
      inventorySetQuantities: { inventoryAdjustmentGroup: { createdAt: string } | null; userErrors: Array<{ message: string }> };
    }>(userId,
      `
      mutation SetInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          inventoryAdjustmentGroup { createdAt }
          userErrors { message }
        }
      }
    `,
      {
        idempotencyKey,
        input: {
          name: 'available',
          reason: 'correction',
          referenceDocumentUri: `gid://commandctr/InventoryAdjustment/${inventoryItemId}`,
          quantities: [{
            inventoryItemId,
            locationId: payload.locationId,
            quantity: payload.quantity,
            changeFromQuantity: currentQuantity
          }]
        }
      });

    if (data.inventorySetQuantities.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.inventorySetQuantities.userErrors[0]?.message ?? 'Shopify inventory update failed');
    }

    const existingRow = await InventoryModel.findOne({
      userId,
      inventoryItemId,
      locationId: payload.locationId,
      isActive: { $ne: false }
    });
    if (existingRow) {
      const availability = inventoryUtils.calculateInventoryAvailability(
        payload.quantity,
        existingRow.safetyBuffer ?? 0,
        existingRow.lowStockThreshold ?? 5
      );
      await InventoryModel.updateOne(
        { _id: existingRow._id },
        {
          $set: {
            shopifyQuantity: availability.shopifyQuantity,
            availableQuantity: availability.availableQuantity,
            safetyBuffer: availability.safetyBuffer,
            lowStockThreshold: availability.lowStockThreshold,
            isActive: true,
            sourceStatus: 'active',
            lastSyncedAt: new Date()
          },
          $unset: {
            staleReason: 1,
            staleMarkedAt: 1
          }
        }
      );
    }

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'inventory',
      entityId: inventoryItemId,
      action: 'update-inventory',
      status: 'success',
      message: 'Updated Shopify inventory quantity successfully'
    });

    return data.inventorySetQuantities.inventoryAdjustmentGroup;
  }
};
