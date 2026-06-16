import { ProductDocument } from '@/modules/products/product.interface';
import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { getEbayCommerceConfig, getMarketplaceCurrency } from './ebay.client';

interface EbayInventoryItemPayload {
  availability: {
    shipToLocationAvailability: {
      quantity: number;
    };
  };
  condition: string;
  conditionDescription?: string;
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

interface NormalizedCondition {
  conditionEnum: string;
  conditionId: string;
}

const MAX_EBAY_ASPECT_NAME_LENGTH = 40;
const MAX_EBAY_ASPECT_VALUE_LENGTH = 65;

const sanitizeHtmlDescription = (value?: string) => {
  const input = value?.trim() || 'No description provided.';
  return input.length > 5000 ? input.slice(0, 5000) : input;
};

const isPublicImageUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));

const truncateForEbayAspect = (value: string, maxLength: number) => {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength).trim();
};

const toAspectValueList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [String(value)];
};

const normalizeAspectSource = (aspects: unknown): Record<string, unknown> => {
  if (!aspects || typeof aspects !== 'object') {
    return {};
  }

  if (typeof (aspects as Map<string, unknown>).entries === 'function') {
    return Object.fromEntries((aspects as Map<string, unknown>).entries());
  }

  if (typeof (aspects as { toJSON?: () => unknown }).toJSON === 'function') {
    const jsonValue = (aspects as { toJSON: () => unknown }).toJSON();
    if (jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
      return jsonValue as Record<string, unknown>;
    }
  }

  return aspects as Record<string, unknown>;
};

const normalizeAspectKeyForMarketplace = (key: string, marketplaceId: string) => {
  const trimmedKey = key.trim();
  const normalizedMarketplaceId = marketplaceId.trim().toUpperCase();
  const normalizedKey = trimmedKey.toLowerCase();

  if (normalizedMarketplaceId === 'EBAY_GB') {
    if (normalizedKey === 'color' || normalizedKey === 'colour') {
      return 'Colour';
    }
  }

  return trimmedKey;
};

const sanitizeAspectMap = (aspects: Record<string, unknown>, marketplaceId: string) => {
  const sanitizedEntries = Object.entries(aspects)
    .map(([key, values]) => {
      const sanitizedKey = truncateForEbayAspect(
        normalizeAspectKeyForMarketplace(key, marketplaceId),
        MAX_EBAY_ASPECT_NAME_LENGTH
      );
      const sanitizedValues = toAspectValueList(values)
        .map((value) => truncateForEbayAspect(String(value), MAX_EBAY_ASPECT_VALUE_LENGTH))
        .filter(Boolean)
        .filter((value, index, array) => array.indexOf(value) === index);

      return [sanitizedKey, sanitizedValues] as const;
    })
    .filter(([key, values]) => key && values.length > 0);

  return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : undefined;
};

const buildAspectMap = (product: ProductDocument) => {
  const config = getEbayCommerceConfig();
  const marketplaceId = product.ebayMarketplaceId?.trim() || config.marketplaceId;
  const normalizedSpecifics = normalizeAspectSource(product.ebayItemSpecifics);
  if (Object.keys(normalizedSpecifics).length > 0) {
    return sanitizeAspectMap(normalizedSpecifics, marketplaceId);
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

  return Object.keys(aspects).length ? sanitizeAspectMap(aspects, marketplaceId) : undefined;
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

const normalizeCondition = (value: string | undefined): NormalizedCondition => {
  const rawValue = value?.trim();
  const normalizedValue = rawValue?.toUpperCase().replace(/[\s-]+/g, '_');

  if (!normalizedValue) {
    return {
      conditionEnum: 'NEW',
      conditionId: '1000'
    };
  }

  const mappedConditions: Record<string, NormalizedCondition> = {
    NEW: { conditionEnum: 'NEW', conditionId: '1000' },
    '1000': { conditionEnum: 'NEW', conditionId: '1000' },
    NEW_OTHER: { conditionEnum: 'NEW_OTHER', conditionId: '1500' },
    '1500': { conditionEnum: 'NEW_OTHER', conditionId: '1500' },
    NEW_WITH_DEFECTS: { conditionEnum: 'NEW_WITH_DEFECTS', conditionId: '1750' },
    '1750': { conditionEnum: 'NEW_WITH_DEFECTS', conditionId: '1750' },
    LIKE_NEW: { conditionEnum: 'LIKE_NEW', conditionId: '2750' },
    '2750': { conditionEnum: 'LIKE_NEW', conditionId: '2750' },
    USED: { conditionEnum: 'USED_EXCELLENT', conditionId: '3000' },
    USED_EXCELLENT: { conditionEnum: 'USED_EXCELLENT', conditionId: '3000' },
    '3000': { conditionEnum: 'USED_EXCELLENT', conditionId: '3000' },
    USED_VERY_GOOD: { conditionEnum: 'USED_VERY_GOOD', conditionId: '4000' },
    '4000': { conditionEnum: 'USED_VERY_GOOD', conditionId: '4000' },
    USED_GOOD: { conditionEnum: 'USED_GOOD', conditionId: '5000' },
    '5000': { conditionEnum: 'USED_GOOD', conditionId: '5000' },
    USED_ACCEPTABLE: { conditionEnum: 'USED_ACCEPTABLE', conditionId: '6000' },
    '6000': { conditionEnum: 'USED_ACCEPTABLE', conditionId: '6000' },
    FOR_PARTS_OR_NOT_WORKING: { conditionEnum: 'FOR_PARTS_OR_NOT_WORKING', conditionId: '7000' },
    '7000': { conditionEnum: 'FOR_PARTS_OR_NOT_WORKING', conditionId: '7000' }
  };

  const mappedCondition = mappedConditions[normalizedValue];
  if (mappedCondition) {
    return mappedCondition;
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    `Unsupported eBay inventory condition "${rawValue}". Use NEW/1000, USED/3000, or a valid eBay Inventory condition enum.`
  );
};

const getCondition = (product: ProductDocument) => {
  const config = getEbayCommerceConfig();
  return normalizeCondition(product.ebayCondition?.trim() || config.condition);
};

const getOfferCurrency = (product: ProductDocument) => {
  const config = getEbayCommerceConfig();
  const marketplaceId = product.ebayMarketplaceId?.trim() || config.marketplaceId;
  const marketplaceCurrency = getMarketplaceCurrency(marketplaceId);
  const productCurrency = product.ebayCurrency?.trim().toUpperCase();

  if (!productCurrency) {
    return marketplaceCurrency;
  }

  return productCurrency === marketplaceCurrency ? productCurrency : marketplaceCurrency;
};

export const ebayProductMapper = {
  getSku: buildSku,
  getPrice,
  getQuantity,
  getImages,
  getCondition,
  getOfferCurrency,
  getListingDescription,
  normalizeCondition,

  toInventoryItem(product: ProductDocument): EbayInventoryItemPayload {
    const normalizedCondition = getCondition(product);
    const inventoryDescription = getListingDescription(product);

    return {
      availability: {
        shipToLocationAvailability: {
          quantity: getQuantity(product)
        }
      },
      condition: normalizedCondition.conditionEnum,
      ...(normalizedCondition.conditionEnum !== 'NEW' &&
      normalizedCondition.conditionEnum !== 'LIKE_NEW' &&
      normalizedCondition.conditionEnum !== 'NEW_OTHER' &&
      normalizedCondition.conditionEnum !== 'NEW_WITH_DEFECTS'
        ? { conditionDescription: inventoryDescription.slice(0, 1000) }
        : {}),
      product: {
        title: product.title,
        description: inventoryDescription,
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
          currency: getOfferCurrency(product)
        }
      },
      listingDuration: config.listingDuration
    };
  }
};
