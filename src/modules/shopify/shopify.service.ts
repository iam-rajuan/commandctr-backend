import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';

import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { marketplaceConnectionService } from '@/modules/marketplace-connections/marketplace-connection.service';
import { InventoryModel } from '@/modules/inventory/inventory.model';
import { OrderModel } from '@/modules/orders/order.model';
import { ProductModel } from '@/modules/products/product.model';
import { syncLogService } from '@/modules/sync/sync-log.service';
import { ApiError } from '@/shared/api-error';
import { encryptionUtils } from '@/utils/encryption';

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
  price?: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  inventoryItem?: {
    id?: string;
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
      image?: { url?: string };
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
  status?: string;
  tags?: string[];
  imagePath?: string;
  publishToOnlineStore?: boolean;
  variants: Array<{ title: string; price: string; sku?: string }>;
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
  'read_products',
  'write_products',
  'read_publications',
  'write_publications'
].join(',');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const oauthStateStore = new Map<string, { userId: string; createdAt: number }>();

const productSelection = `
  id
  title
  descriptionHtml
  handle
  vendor
  productType
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
      }
    }
  }
  variants(first: 50) {
    nodes {
      id
      title
      sku
      price
      compareAtPrice
      inventoryQuantity
      inventoryItem {
        id
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
    return {
      shopDomain: connection.shopDomain,
      accessToken: encryptionUtils.decrypt(connection.accessTokenEncrypted),
      source: 'marketplace_connection'
    };
  }

  if (connection) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify store is not connected.');
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
  const localProduct = await ProductModel.findOneAndUpdate(
    { userId, shopifyProductId: mapped.shopifyProductId },
    { $set: mapped },
    { upsert: true, new: true }
  );

  return {
    mapped,
    localProduct
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

  for (const variant of shopifyProduct.variants?.nodes ?? []) {
    const inventoryItemId = variant.inventoryItem?.id;
    if (!inventoryItemId) {
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

      await InventoryModel.findOneAndUpdate(
        { userId, inventoryItemId, locationId },
        {
          $set: {
            ...mappedInventory,
            productId: localProduct?._id ? localProduct._id.toString() : undefined,
            marketplace: 'shopify',
            shopifyProductId: shopifyProduct.id,
            shopifyVariantId: variant.id,
            inventoryItemId,
            sku: variant.sku ?? existing?.sku ?? '',
            title: mappedInventory.title || `${shopifyProduct.title} - ${variant.title}`,
            availableQuantity: level.quantities?.[0]?.quantity ?? variant.inventoryQuantity ?? 0,
            locationId,
            locationName,
            lastSyncedAt: new Date()
          },
          $setOnInsert: {
            safetyBuffer: 0,
            lowStockThreshold: 5
          }
        },
        { upsert: true, new: true }
      );

      syncedCount += 1;
    }
  }

  return syncedCount;
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

const getStoredShopifyScopes = async (userId: string) => {
  const connection = await marketplaceConnectionService.getShopifyConnection(userId);
  if (!connection?.scopes?.length) {
    return null;
  }

  return new Set(connection.scopes.map((scope) => scope.trim()).filter(Boolean));
};

const canManageShopifyPublications = async (userId: string, shouldPublish: boolean) => {
  const scopes = await getStoredShopifyScopes(userId);
  if (!scopes) {
    return { allowed: true, missingScopes: [] as string[] };
  }

  const requiredScopes = shouldPublish
    ? ['read_publications', 'write_publications']
    : ['read_publications'];
  const missingScopes = requiredScopes.filter((scope) => !scopes.has(scope));

  return {
    allowed: missingScopes.length === 0,
    missingScopes
  };
};

const syncPrimaryVariantDetails = async (
  userId: string,
  product: ShopifyProductNode,
  primaryVariant: ShopifyProductMutationPayload['variants'][0] | undefined,
  warnings: string[]
) => {
  const createdVariant = product.variants?.nodes?.[0];

  if (createdVariant && primaryVariant?.price) {
    try {
      await updateShopifyVariantPrice(userId, product.id, createdVariant.id, primaryVariant.price);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown variant price update failure';
      warnings.push(`Default variant price was not updated: ${message}`);
      logger.warn(
        {
          userId,
          shopifyProductId: product.id,
          shopifyVariantId: createdVariant.id,
          message
        },
        'Shopify product mutation completed but default variant price update failed'
      );
    }
  }

  if (createdVariant?.inventoryItem?.id && primaryVariant?.sku) {
    try {
      await updateShopifyInventoryItemSku(userId, createdVariant.inventoryItem.id, primaryVariant.sku);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown variant SKU update failure';
      warnings.push(`Default variant SKU was not updated: ${message}`);
      logger.warn(
        {
          userId,
          shopifyProductId: product.id,
          inventoryItemId: createdVariant.inventoryItem.id,
          message
        },
        'Shopify product mutation completed but default variant SKU update failed'
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

    for (const productNode of products) {
      const { localProduct } = await upsertLocalShopifyProduct(userId, productNode);
      await syncInventoryRowsFromShopifyProduct({
        userId,
        localProduct,
        shopifyProduct: productNode,
        fallbackLocation
      });
    }

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'product',
      action: 'import-products',
      status: 'success',
      message: `Imported ${products.length} Shopify products`
    });

    return { count: products.length };
  },

  async createProduct(userId: string, payload: ShopifyProductMutationPayload): Promise<ShopifyProductMutationResult> {
    const primaryVariant = payload.variants[0];
    const warnings: string[] = [];
    const categoryId = await resolveShopifyCategoryId(userId, payload.category);
    if (payload.category && !categoryId) {
      warnings.push(`Shopify category could not be matched for "${payload.category}".`);
    }
    const { data } = await executeShopifyRequest<{
      productCreate: { product: ShopifyProductNode; userErrors: Array<{ message: string }> };
    }>(userId,
      `
      mutation CreateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            ${productSelection}
          }
          userErrors { message }
        }
      }
    `,
      {
        product: {
          title: payload.title,
          descriptionHtml: payload.description,
          vendor: payload.vendor,
          productType: payload.productType,
          category: categoryId ?? undefined,
          status: payload.status,
          tags: payload.tags ?? []
        }
      });

    if (data.productCreate.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.productCreate.userErrors[0]?.message ?? 'Shopify product creation failed');
    }

    await syncPrimaryVariantDetails(userId, data.productCreate.product, primaryVariant, warnings);

    let finalProduct = await fetchShopifyProductById(userId, data.productCreate.product.id);
    const imageSyncResult = await syncShopifyProductImage(userId, finalProduct, payload.imagePath, payload.title, warnings);
    finalProduct = imageSyncResult.product;
    const publishedToOnlineStore = payload.publishToOnlineStore
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
      warnings: inventoryRowsSynced > 0 ? warnings : [...warnings, 'Local inventory rows could not be derived for this product.']
    };
  },

  async updateProduct(userId: string, shopifyProductId: string, payload: Partial<ShopifyProductMutationPayload>): Promise<ShopifyProductMutationResult> {
    const warnings: string[] = [];
    const categoryId = await resolveShopifyCategoryId(userId, payload.category);
    if (payload.category && !categoryId) {
      warnings.push(`Shopify category could not be matched for "${payload.category}".`);
    }
    const { data } = await executeShopifyRequest<{
      productUpdate: { product: ShopifyProductNode; userErrors: Array<{ message: string }> };
    }>(userId,
      `
      mutation UpdateProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            title
            descriptionHtml
            handle
            vendor
            productType
            status
            tags
            totalInventory
            featuredImage { url }
            variants(first: 20) {
              nodes {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                inventoryItem { id }
              }
            }
          }
          userErrors { message }
        }
      }
      `,
      {
        product: {
          id: shopifyProductId,
          title: payload.title,
          descriptionHtml: payload.description,
          vendor: payload.vendor,
          productType: payload.productType,
          category: categoryId ?? undefined,
          status: payload.status,
          tags: payload.tags
        }
      });

    if (data.productUpdate.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.productUpdate.userErrors[0]?.message ?? 'Shopify product update failed');
    }

    await syncPrimaryVariantDetails(userId, data.productUpdate.product, payload.variants?.[0], warnings);

    let finalProduct = await fetchShopifyProductById(userId, shopifyProductId);
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
        ? await syncShopifyPublicationState(userId, shopifyProductId, payload.publishToOnlineStore, warnings)
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
        const levels = variant.inventoryItem?.inventoryLevels?.nodes ?? [];
        if (!levels.length) {
          return [{
            productId: productNode.id,
            productTitle: productNode.title,
            variantId: variant.id,
            variantTitle: variant.title,
            inventoryItemId: variant.inventoryItem?.id ?? '',
            sku: variant.sku ?? '',
            quantity: variant.inventoryQuantity ?? 0,
            locationId: '',
            locationName: ''
          }];
        }

        return levels.map((level) => ({
          productId: productNode.id,
          productTitle: productNode.title,
          variantId: variant.id,
          variantTitle: variant.title,
          inventoryItemId: variant.inventoryItem?.id ?? '',
          sku: variant.sku ?? '',
          quantity: level.quantities?.[0]?.quantity ?? variant.inventoryQuantity ?? 0,
          locationId: level.location?.id ?? '',
          locationName: level.location?.name ?? ''
        }));
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

    await InventoryModel.updateOne(
      { userId, inventoryItemId, locationId: payload.locationId },
      { $set: { availableQuantity: payload.quantity, lastSyncedAt: new Date() } }
    );

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
