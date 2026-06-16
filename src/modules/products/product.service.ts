import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { IProduct, ProductVariant } from './product.interface';
import { ProductModel } from './product.model';

const normalizeVariants = (variants: ProductVariant[]) =>
  variants.map((variant, index) => ({
    ...variant,
    title: variant.title?.trim() || (index === 0 ? 'Default Title' : `Variant ${index + 1}`),
    sku: variant.sku?.trim() || undefined,
    price: variant.price?.trim() || undefined,
    compareAtPrice: variant.compareAtPrice?.trim() || undefined,
    inventoryQuantity: typeof variant.inventoryQuantity === 'number' ? Math.max(variant.inventoryQuantity, 0) : 0,
    inventoryItemId: variant.inventoryItemId?.trim() || undefined,
    shopifyVariantId: variant.shopifyVariantId?.trim() || undefined
  }));

const normalizeImages = (images?: string[], featuredImage?: string) => {
  const values = [
    featuredImage?.trim(),
    ...(images ?? []).map((image) => image.trim())
  ].filter(Boolean) as string[];

  return Array.from(new Set(values));
};

const normalizeItemSpecifics = (input?: Record<string, string | string[]>) => {
  if (!input) {
    return undefined;
  }

  const entries = Object.entries(input)
    .map(([key, value]) => {
      const normalizedValues = (Array.isArray(value) ? value : [value])
        .map((entry) => entry.trim())
        .filter(Boolean);

      return [key.trim(), normalizedValues] as const;
    })
    .filter(([key, values]) => key && values.length > 0);

  return entries.length ? Object.fromEntries(entries) : undefined;
};

const buildCreateProductPayload = (payload: Partial<IProduct>) => {
  const variants = normalizeVariants(payload.variants ?? []);
  const images = normalizeImages(payload.images, payload.featuredImage);
  const totalInventory =
    typeof payload.totalInventory === 'number'
      ? Math.max(payload.totalInventory, 0)
      : variants.reduce((sum, variant) => sum + (variant.inventoryQuantity ?? 0), 0);

  return {
    ...payload,
    marketplace: payload.marketplace ?? 'shopify',
    title: payload.title?.trim(),
    description: payload.description?.trim() || undefined,
    handle: payload.handle?.trim() || undefined,
    vendor: payload.vendor?.trim() || undefined,
    productType: payload.productType?.trim() || undefined,
    status: payload.status?.trim() || undefined,
    tags: (payload.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    featuredImage: payload.featuredImage?.trim() || images[0],
    images,
    variants,
    totalInventory,
    shopifyProductId: payload.shopifyProductId?.trim() || undefined,
    ebaySku: payload.ebaySku?.trim() || undefined,
    ebayMarketplaceId: payload.ebayMarketplaceId?.trim() || undefined,
    ebayCurrency: payload.ebayCurrency?.trim() || undefined,
    ebayCondition: payload.ebayCondition?.trim() || undefined,
    ebayCategoryId: payload.ebayCategoryId?.trim() || undefined,
    ebayItemSpecifics: normalizeItemSpecifics(payload.ebayItemSpecifics as Record<string, string | string[]> | undefined),
    ebayListingNotes: payload.ebayListingNotes?.trim() || undefined,
    ebayDescriptionOverride: payload.ebayDescriptionOverride?.trim() || undefined
  };
};

const hasOwn = <T extends object>(value: T, key: keyof T) => Object.prototype.hasOwnProperty.call(value, key);

const buildUpdateProductPayload = (payload: Partial<IProduct>) => {
  const productPayload: Record<string, unknown> = {};

  if (hasOwn(payload, 'marketplace')) {
    productPayload.marketplace = payload.marketplace ?? 'shopify';
  }

  if (hasOwn(payload, 'title')) {
    productPayload.title = payload.title?.trim();
  }

  if (hasOwn(payload, 'description')) {
    productPayload.description = payload.description?.trim() || undefined;
  }

  if (hasOwn(payload, 'handle')) {
    productPayload.handle = payload.handle?.trim() || undefined;
  }

  if (hasOwn(payload, 'vendor')) {
    productPayload.vendor = payload.vendor?.trim() || undefined;
  }

  if (hasOwn(payload, 'productType')) {
    productPayload.productType = payload.productType?.trim() || undefined;
  }

  if (hasOwn(payload, 'status')) {
    productPayload.status = payload.status?.trim() || undefined;
  }

  if (hasOwn(payload, 'tags')) {
    productPayload.tags = (payload.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  }

  if (hasOwn(payload, 'featuredImage') || hasOwn(payload, 'images')) {
    const images = normalizeImages(payload.images, payload.featuredImage);
    productPayload.featuredImage = payload.featuredImage?.trim() || images[0];
    productPayload.images = images;
  }

  if (hasOwn(payload, 'variants')) {
    const variants = normalizeVariants(payload.variants ?? []);
    productPayload.variants = variants;

    if (!hasOwn(payload, 'totalInventory')) {
      productPayload.totalInventory = variants.reduce((sum, variant) => sum + (variant.inventoryQuantity ?? 0), 0);
    }
  }

  if (hasOwn(payload, 'totalInventory')) {
    productPayload.totalInventory =
      typeof payload.totalInventory === 'number' ? Math.max(payload.totalInventory, 0) : 0;
  }

  if (hasOwn(payload, 'shopifyProductId')) {
    productPayload.shopifyProductId = payload.shopifyProductId?.trim() || undefined;
  }

  if (hasOwn(payload, 'ebaySku')) {
    productPayload.ebaySku = payload.ebaySku?.trim() || undefined;
  }

  if (hasOwn(payload, 'ebayMarketplaceId')) {
    productPayload.ebayMarketplaceId = payload.ebayMarketplaceId?.trim() || undefined;
  }

  if (hasOwn(payload, 'ebayCurrency')) {
    productPayload.ebayCurrency = payload.ebayCurrency?.trim() || undefined;
  }

  if (hasOwn(payload, 'ebayCondition')) {
    productPayload.ebayCondition = payload.ebayCondition?.trim() || undefined;
  }

  if (hasOwn(payload, 'ebayCategoryId')) {
    productPayload.ebayCategoryId = payload.ebayCategoryId?.trim() || undefined;
  }

  if (hasOwn(payload, 'ebayItemSpecifics')) {
    productPayload.ebayItemSpecifics = normalizeItemSpecifics(
      payload.ebayItemSpecifics as Record<string, string | string[]> | undefined
    );
  }

  if (hasOwn(payload, 'ebayListingNotes')) {
    productPayload.ebayListingNotes = payload.ebayListingNotes?.trim() || undefined;
  }

  if (hasOwn(payload, 'ebayDescriptionOverride')) {
    productPayload.ebayDescriptionOverride = payload.ebayDescriptionOverride?.trim() || undefined;
  }

  return productPayload;
};

export const productService = {
  async getProducts(userId: string) {
    return ProductModel.find({ userId }).sort({ updatedAt: -1 });
  },

  async createProduct(userId: string, payload: Partial<IProduct>) {
    const productPayload = buildCreateProductPayload(payload);
    const product = await ProductModel.create({
      ...productPayload,
      userId
    });

    return product;
  },

  async getProductById(userId: string, productId: string) {
    const product = await ProductModel.findOne({ _id: productId, userId });
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }

    return product;
  },

  async updateProduct(userId: string, productId: string, payload: Record<string, unknown>) {
    const productPayload = buildUpdateProductPayload(payload as Partial<IProduct>);
    const product = await ProductModel.findOneAndUpdate(
      { _id: productId, userId },
      { $set: productPayload },
      { new: true, runValidators: true }
    );

    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }

    return product;
  },

  async deleteProduct(userId: string, productId: string) {
    const product = await ProductModel.findOneAndDelete({ _id: productId, userId });
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }
  }
};
