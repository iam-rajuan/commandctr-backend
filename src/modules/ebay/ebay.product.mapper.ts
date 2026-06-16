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

const isPublicImageUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));

const buildAspectMap = (product: ProductDocument) => {
  if (product.ebayItemSpecifics && Object.keys(product.ebayItemSpecifics).length > 0) {
    return product.ebayItemSpecifics;
  }

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
  const candidates = [product.featuredImage, ...(product.images ?? [])].filter(isPublicImageUrl) as string[];
  return Array.from(new Set(candidates));
};

const getListingDescription = (product: ProductDocument) => {
  const preferredDescription = product.ebayDescriptionOverride?.trim() || product.description;
  const notes = product.ebayListingNotes?.trim();

  if (!notes) {
    return sanitizeHtmlDescription(preferredDescription);
  }

  return sanitizeHtmlDescription([preferredDescription, notes].filter(Boolean).join('\n\n'));
};

const getCondition = (product: ProductDocument) => {
  const config = getEbayCommerceConfig();
  return product.ebayCondition?.trim() || config.condition;
};

export const ebayProductMapper = {
  getSku: buildSku,
  getPrice,
  getQuantity,
  getImages,
  getCondition,
  getListingDescription,

  toInventoryItem(product: ProductDocument): EbayInventoryItemPayload {
    return {
      availability: {
        shipToLocationAvailability: {
          quantity: getQuantity(product)
        }
      },
      condition: getCondition(product),
      product: {
        title: product.title,
        description: getListingDescription(product),
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
      categoryId: product.ebayCategoryId || config.categoryId,
      merchantLocationKey: config.merchantLocationKey,
      listingDescription: getListingDescription(product),
      listingPolicies: {
        paymentPolicyId: config.paymentPolicyId,
        returnPolicyId: config.returnPolicyId,
        fulfillmentPolicyId: config.fulfillmentPolicyId
      },
      pricingSummary: {
        price: {
          value: getPrice(product),
          currency: product.ebayCurrency || config.currency
        }
      },
      listingDuration: config.listingDuration
    };
  }
};
