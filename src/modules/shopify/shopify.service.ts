import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';

import { env } from '@/config/env';
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
  title: string;
  variants?: {
    nodes?: ShopifyVariantNode[];
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
  'write_products'
].join(',');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const oauthStateStore = new Map<string, { userId: string; createdAt: number }>();

const productsQuery = `
  query GetProducts {
    products(first: 50) {
      nodes {
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
        shippingAddress
        billingAddress
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

const buildShopifyHmacMessage = (query: Request['query']) =>
  Object.keys(query)
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .map((key) => `${key}=${getSingleQueryValue(query[key])}`)
    .join('&');

const isValidShopifyHmac = (query: Request['query']) => {
  const hmac = getSingleQueryValue(query.hmac);
  if (!hmac || !env.SHOPIFY_CLIENT_SECRET) {
    return false;
  }

  const digest = createHmac('sha256', env.SHOPIFY_CLIENT_SECRET).update(buildShopifyHmacMessage(query)).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch {
    return false;
  }
};

const buildFrontendRedirectUrl = (params: Record<string, string>) => {
  if (!env.FRONTEND_URL) {
    return null;
  }

  const url = new URL(env.FRONTEND_URL);
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

  if (env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return {
      shopDomain: env.SHOPIFY_SHOP_DOMAIN,
      accessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN,
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

const requireOAuthConfig = () => {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_REDIRECT_URI) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify OAuth environment variables are not fully configured');
  }
};

export const shopifyService = {
  async getConnectionState(userId: string) {
    const connection = await marketplaceConnectionService.getShopifyConnection(userId);
    if (connection?.accessTokenEncrypted) {
      return connection.status;
    }

    return env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_ACCESS_TOKEN ? 'fallback_configured' : 'not_connected';
  },

  async getConnectUrl(userId: string) {
    requireOAuthConfig();

    const state = createOAuthState(userId);
    const url = new URL(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/oauth/authorize`);
    url.searchParams.set('client_id', env.SHOPIFY_CLIENT_ID!);
    url.searchParams.set('scope', SHOPIFY_SCOPES);
    url.searchParams.set('redirect_uri', env.SHOPIFY_REDIRECT_URI!);
    url.searchParams.set('state', state);

    return url.toString();
  },

  async handleOAuthCallback(req: Request, res: Response) {
    const shop = getSingleQueryValue(req.query.shop).toLowerCase();
    const code = getSingleQueryValue(req.query.code);
    const state = getSingleQueryValue(req.query.state);

    if (!shop || !code || !state || !getSingleQueryValue(req.query.hmac)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required Shopify OAuth callback parameters');
    }

    if (!isValidShopifyHmac(req.query)) {
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

    const redirectUrl = buildFrontendRedirectUrl({
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

    for (const productNode of products) {
      const mapped = shopifyMapper.toLocalProduct(userId, productNode);
      await ProductModel.findOneAndUpdate(
        { userId, shopifyProductId: mapped.shopifyProductId },
        { $set: mapped },
        { upsert: true, new: true }
      );

      for (const variant of productNode.variants?.nodes ?? []) {
        const levels = variant.inventoryItem?.inventoryLevels?.nodes ?? [];
        if (!levels.length) {
          await InventoryModel.findOneAndUpdate(
            { userId, inventoryItemId: variant.inventoryItem?.id ?? '', locationId: '' },
            { $set: shopifyMapper.toLocalInventory(userId, productNode, variant) },
            { upsert: true, new: true }
          );
        }

        for (const level of levels) {
          await InventoryModel.findOneAndUpdate(
            { userId, inventoryItemId: variant.inventoryItem?.id ?? '', locationId: level.location?.id ?? '' },
            { $set: shopifyMapper.toLocalInventory(userId, productNode, variant, level) },
            { upsert: true, new: true }
          );
        }
      }
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

  async createProduct(userId: string, payload: { title: string; description?: string; vendor?: string; productType?: string; status?: string; tags?: string[]; variants: Array<{ title: string; price: string; sku?: string }> }) {
    const { data } = await executeShopifyRequest<{
      productCreate: { product: ShopifyProductNode; userErrors: Array<{ message: string }> };
    }>(userId,
      `
      mutation CreateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
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
          title: payload.title,
          descriptionHtml: payload.description,
          vendor: payload.vendor,
          productType: payload.productType,
          status: payload.status,
          tags: payload.tags ?? [],
          productOptions: [],
          variants: payload.variants.map((variant) => ({
            price: variant.price,
            inventoryItem: { sku: variant.sku },
            optionValues: [{ name: variant.title, optionName: 'Title' }]
          }))
        }
      });

    if (data.productCreate.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.productCreate.userErrors[0]?.message ?? 'Shopify product creation failed');
    }

    const mapped = shopifyMapper.toLocalProduct(userId, data.productCreate.product);
    await ProductModel.findOneAndUpdate(
      { userId, shopifyProductId: mapped.shopifyProductId },
      { $set: mapped },
      { upsert: true, new: true }
    );

    await marketplaceConnectionService.markShopifySynced(userId);
    await syncLogService.create({
      userId,
      entityType: 'product',
      entityId: mapped.shopifyProductId,
      action: 'create-product',
      status: 'success',
      message: 'Created Shopify product successfully'
    });

    return data.productCreate.product;
  },

  async updateProduct(userId: string, shopifyProductId: string, payload: Record<string, unknown>) {
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
          status: payload.status,
          tags: payload.tags
        }
      });

    if (data.productUpdate.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.productUpdate.userErrors[0]?.message ?? 'Shopify product update failed');
    }

    const mapped = shopifyMapper.toLocalProduct(userId, data.productUpdate.product);
    await ProductModel.findOneAndUpdate(
      { userId, shopifyProductId },
      { $set: mapped },
      { upsert: true, new: true }
    );

    await marketplaceConnectionService.markShopifySynced(userId);
    return data.productUpdate.product;
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
    const { data } = await executeShopifyRequest<{
      inventorySetQuantities: { inventoryAdjustmentGroup: { createdAt: string } | null; userErrors: Array<{ message: string }> };
    }>(userId,
      `
      mutation SetInventory($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup { createdAt }
          userErrors { message }
        }
      }
    `,
      {
        input: {
          name: 'available',
          reason: 'correction',
          quantities: [{ inventoryItemId, locationId: payload.locationId, quantity: payload.quantity }]
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
