import { ProductDocument } from '@/modules/products/product.interface';

import { getEbayCommerceConfig } from './ebay.client';

interface EbayInventoryItemPayload {
  availability: {
    shipToLocationAvailability: {
      quantity: number;
    };
  };
  condition: string;
  product: {
    title: string;
    description: string;
    imageUrls: string[];
    aspects?: Record<string, string[]>;
  };
}

interface EbayOfferPayload {
  sku: string;
  marketplaceId: string;
  format: string;
  availableQuantity: number;
  categoryId: string;
  merchantLocationKey: string;
  listingDescription: string;
  listingPolicies: {
    paymentPolicyId: string;
    returnPolicyId: string;
    fulfillmentPolicyId: string;
  };
  pricingSummary: {
    price: {
      value: string;
      currency: string;
    };
  };
  listingDuration: string;
}

const sanitizeHtmlDescription = (value?: string) => {
  const input = value?.trim() || 'No description provided.';
  return input.length > 5000 ? input.slice(0, 5000) : input;
};

const buildAspectMap = (product: ProductDocument) => {
  const aspects: Record<string, string[]> = {};

  if (product.vendor) {
    aspects.Brand = [product.vendor];
  }

  if (product.productType) {
    aspects.Type = [product.productType];
  }

  if (product.tags.length) {
    aspects.Tags = product.tags.slice(0, 10);
  }

  return Object.keys(aspects).length ? aspects : undefined;
};

const getPrimaryVariant = (product: ProductDocument) => {
  if (!product.variants.length) {
    return null;
  }

  if (product.ebaySku) {
    return product.variants.find((variant) => variant.sku === product.ebaySku) ?? product.variants[0];
  }

  return product.variants.find((variant) => Boolean(variant.sku)) ?? product.variants[0];
};

const buildSku = (product: ProductDocument) => {
  const primaryVariant = getPrimaryVariant(product);
  return (
    product.ebaySku ||
    primaryVariant?.sku ||
    product.shopifyProductId ||
    product._id.toString()
  );
};

const getPrice = (product: ProductDocument) => {
  const primaryVariant = getPrimaryVariant(product);
  return primaryVariant?.price || '0.00';
};

const getQuantity = (product: ProductDocument) => {
  const primaryVariant = getPrimaryVariant(product);
  if (typeof primaryVariant?.inventoryQuantity === 'number') {
    return Math.max(primaryVariant.inventoryQuantity, 0);
  }

  return Math.max(product.totalInventory ?? 0, 0);
};

const getImages = (product: ProductDocument) => {
  return product.featuredImage ? [product.featuredImage] : [];
};

export const ebayProductMapper = {
  getSku: buildSku,

  toInventoryItem(product: ProductDocument): EbayInventoryItemPayload {
    const config = getEbayCommerceConfig();

    return {
      availability: {
        shipToLocationAvailability: {
          quantity: getQuantity(product)
        }
      },
      condition: config.condition,
      product: {
        title: product.title,
        description: sanitizeHtmlDescription(product.description),
        imageUrls: getImages(product),
        aspects: buildAspectMap(product)
      }
    };
  },

  toOffer(product: ProductDocument): EbayOfferPayload {
    const config = getEbayCommerceConfig();

    return {
      sku: buildSku(product),
      marketplaceId: product.ebayMarketplaceId || config.marketplaceId,
      format: config.listingFormat,
      availableQuantity: getQuantity(product),
      categoryId: config.categoryId,
      merchantLocationKey: config.merchantLocationKey,
      listingDescription: sanitizeHtmlDescription(product.description),
      listingPolicies: {
        paymentPolicyId: config.paymentPolicyId,
        returnPolicyId: config.returnPolicyId,
        fulfillmentPolicyId: config.fulfillmentPolicyId
      },
      pricingSummary: {
        price: {
          value: getPrice(product),
          currency: config.currency
        }
      },
      listingDuration: config.listingDuration
    };
  }
};
