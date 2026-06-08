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
  descriptionHtml?: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  status?: string;
  tags?: string[];
  totalInventory?: number;
  featuredImage?: { url?: string };
  variants?: { nodes?: ShopifyVariantNode[] };
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  email?: string;
  customer?: { firstName?: string; lastName?: string };
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  currencyCode?: string;
  totalPriceSet?: { shopMoney?: { amount?: string } };
  subtotalPriceSet?: { shopMoney?: { amount?: string } };
  totalTaxSet?: { shopMoney?: { amount?: string } };
  processedAt?: string;
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
  shippingAddress?: unknown;
  billingAddress?: unknown;
};

export const shopifyMapper = {
  toLocalProduct(userId: string, node: ShopifyProductNode) {
    return {
      userId,
      marketplace: 'shopify' as const,
      shopifyProductId: node.id,
      title: node.title,
      description: node.descriptionHtml ?? '',
      handle: node.handle,
      vendor: node.vendor ?? '',
      productType: node.productType ?? '',
      status: node.status ?? '',
      tags: Array.isArray(node.tags) ? node.tags : [],
      totalInventory: node.totalInventory ?? 0,
      featuredImage: node.featuredImage?.url ?? '',
      variants: (node.variants?.nodes ?? []).map((variant) => ({
        shopifyVariantId: variant.id,
        title: variant.title,
        sku: variant.sku ?? '',
        price: variant.price ?? '',
        compareAtPrice: variant.compareAtPrice ?? '',
        inventoryQuantity: variant.inventoryQuantity ?? 0,
        inventoryItemId: variant.inventoryItem?.id ?? ''
      })),
      rawShopifyData: node,
      lastSyncedAt: new Date()
    };
  },

  toLocalOrder(userId: string, node: ShopifyOrderNode) {
    return {
      userId,
      marketplace: 'shopify' as const,
      externalOrderId: node.id,
      shopifyOrderId: node.id,
      orderName: node.name,
      email: node.email ?? '',
      customerName: [node.customer?.firstName, node.customer?.lastName].filter(Boolean).join(' '),
      financialStatus: node.displayFinancialStatus ?? '',
      fulfillmentStatus: node.displayFulfillmentStatus ?? '',
      currency: node.currencyCode ?? '',
      totalPrice: node.totalPriceSet?.shopMoney?.amount ?? '0',
      subtotalPrice: node.subtotalPriceSet?.shopMoney?.amount ?? '0',
      totalTax: node.totalTaxSet?.shopMoney?.amount ?? '0',
      processedAt: node.processedAt ? new Date(node.processedAt) : undefined,
      lineItems: (node.lineItems?.nodes ?? []).map((item) => ({
        title: item.title,
        sku: item.sku ?? '',
        quantity: item.quantity ?? 0,
        price: item.originalUnitPriceSet?.shopMoney?.amount ?? '0',
        shopifyVariantId: item.variant?.id ?? '',
        shopifyProductId: item.product?.id ?? ''
      })),
      shippingAddress: node.shippingAddress ?? null,
      billingAddress: node.billingAddress ?? null,
      rawShopifyData: node,
      lastSyncedAt: new Date()
    };
  },

  toLocalInventory(userId: string, node: ShopifyProductNode, variant: ShopifyVariantNode, level?: ShopifyInventoryLevel) {
    return {
      userId,
      marketplace: 'shopify' as const,
      shopifyProductId: node.id,
      shopifyVariantId: variant.id,
      inventoryItemId: variant.inventoryItem?.id ?? '',
      sku: variant.sku ?? '',
      title: `${node.title} - ${variant.title}`,
      availableQuantity: level?.quantities?.[0]?.quantity ?? variant.inventoryQuantity ?? 0,
      locationId: level?.location?.id ?? '',
      locationName: level?.location?.name ?? '',
      lastSyncedAt: new Date()
    };
  }
};
