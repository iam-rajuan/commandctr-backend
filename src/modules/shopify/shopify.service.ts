import { env } from '@/config/env';
import { httpStatus } from '@/constants/http.constant';
import { InventoryModel } from '@/modules/inventory/inventory.model';
import { OrderModel } from '@/modules/orders/order.model';
import { ProductModel } from '@/modules/products/product.model';
import { syncLogService } from '@/modules/sync/sync-log.service';
import { ApiError } from '@/shared/api-error';

import { shopifyClient } from './shopify.client';
import { shopifyMapper } from './shopify.mapper';
import { ShopifyConnectionModel } from './shopify.model';

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

export const shopifyService = {
  getConnectionState() {
    return env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_ACCESS_TOKEN ? 'connected' : 'not_connected';
  },

  async ensureConfigured() {
    if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Shopify credentials are not configured in environment');
    }
  },

  async getStatus(userId: string) {
    await this.ensureConfigured();
    const data = await shopifyClient.request<{ shop: { name: string; email: string; myshopifyDomain: string } }>(
      `query { shop { name email myshopifyDomain } }`
    );

    await ShopifyConnectionModel.updateOne(
      { userId, shopDomain: data.shop.myshopifyDomain },
      { $set: { status: 'connected', lastSyncedAt: new Date() } },
      { upsert: true }
    );

    return { connected: true, shop: data.shop };
  },

  async getShop() {
    await this.ensureConfigured();
    const data = await shopifyClient.request<{
      shop: { id: string; name: string; email: string; myshopifyDomain: string; currencyCode: string; plan: { displayName: string } };
    }>(`query { shop { id name email myshopifyDomain currencyCode plan { displayName } } }`);

    return data.shop;
  },

  async getProducts() {
    await this.ensureConfigured();
    const data = await shopifyClient.request<{ products: { nodes: ShopifyProductNode[] } }>(productsQuery);
    return data.products.nodes;
  },

  async importProducts(userId: string) {
    const products = await this.getProducts();

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
    await this.ensureConfigured();
    const data = await shopifyClient.request<{
      productCreate: { product: ShopifyProductNode; userErrors: Array<{ message: string }> };
    }>(
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
      }
    );

    if (data.productCreate.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.productCreate.userErrors[0]?.message ?? 'Shopify product creation failed');
    }

    const mapped = shopifyMapper.toLocalProduct(userId, data.productCreate.product);
    await ProductModel.findOneAndUpdate(
      { userId, shopifyProductId: mapped.shopifyProductId },
      { $set: mapped },
      { upsert: true, new: true }
    );

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
    await this.ensureConfigured();
    const data = await shopifyClient.request<{
      productUpdate: { product: ShopifyProductNode; userErrors: Array<{ message: string }> };
    }>(
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
      }
    );

    if (data.productUpdate.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.productUpdate.userErrors[0]?.message ?? 'Shopify product update failed');
    }

    const mapped = shopifyMapper.toLocalProduct(userId, data.productUpdate.product);
    await ProductModel.findOneAndUpdate(
      { userId, shopifyProductId },
      { $set: mapped },
      { upsert: true, new: true }
    );

    return data.productUpdate.product;
  },

  async updateProductPrice(userId: string, shopifyProductId: string, payload: { variantId: string; price: string; compareAtPrice?: string }) {
    await this.ensureConfigured();
    const data = await shopifyClient.request<{
      productVariantsBulkUpdate: { productVariants: Array<{ id: string; price?: string; compareAtPrice?: string }>; userErrors: Array<{ message: string }> };
    }>(
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
      }
    );

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

    return data.productVariantsBulkUpdate.productVariants[0];
  },

  async getOrders() {
    await this.ensureConfigured();
    const data = await shopifyClient.request<{ orders: { nodes: ShopifyOrderNode[] } }>(ordersQuery);
    return data.orders.nodes;
  },

  async importOrders(userId: string) {
    const orders = await this.getOrders();

    for (const orderNode of orders) {
      const mapped = shopifyMapper.toLocalOrder(userId, orderNode);
      await OrderModel.findOneAndUpdate(
        { userId, shopifyOrderId: mapped.shopifyOrderId },
        { $set: mapped },
        { upsert: true, new: true }
      );
    }

    await syncLogService.create({
      userId,
      entityType: 'order',
      action: 'import-orders',
      status: 'success',
      message: `Imported ${orders.length} Shopify orders`
    });

    return { count: orders.length };
  },

  async getLocations() {
    await this.ensureConfigured();
    const data = await shopifyClient.request<{ locations: { nodes: Array<{ id: string; name: string; address?: { formatted?: string[] } }> } }>(
      `query { locations(first: 20) { nodes { id name address { formatted } } } }`
    );

    return data.locations.nodes;
  },

  async getInventory() {
    const products = await this.getProducts();
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
    await this.ensureConfigured();
    const data = await shopifyClient.request<{
      inventorySetQuantities: { inventoryAdjustmentGroup: { createdAt: string } | null; userErrors: Array<{ message: string }> };
    }>(
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
      }
    );

    if (data.inventorySetQuantities.userErrors.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, data.inventorySetQuantities.userErrors[0]?.message ?? 'Shopify inventory update failed');
    }

    await InventoryModel.updateOne(
      { userId, inventoryItemId, locationId: payload.locationId },
      { $set: { availableQuantity: payload.quantity, lastSyncedAt: new Date() } }
    );

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
