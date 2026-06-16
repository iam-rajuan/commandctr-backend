import { logger } from '@/config/logger';
import { httpStatus } from '@/constants/http.constant';
import { marketplaceConnectionService } from '@/modules/marketplace-connections/marketplace-connection.service';
import { ProductModel } from '@/modules/products/product.model';
import { syncLogService } from '@/modules/sync/sync-log.service';
import { ApiError } from '@/shared/api-error';

import { getEbayCommerceConfig, ebayClient } from './ebay.client';
import { EbaySyncJobModel } from './ebay-sync-job.model';
import { EbaySyncJobDocument, EbaySyncJobOperation } from './ebay-sync-job.interface';
import { ebayInventoryService } from './ebay.inventory.service';
import { ebayListingService } from './ebay.listing.service';
import { ebayOfferService } from './ebay.offer.service';
import { ebayProductMapper } from './ebay.product.mapper';

const WORKER_INTERVAL_MS = 2000;
let workerTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

const getRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30000);

const getEbayEnvironment = () => getEbayCommerceConfig().environment;

const validatePublishReadiness = async (userId: string, productId: string) => {
  const product = await ProductModel.findOne({ _id: productId, userId });
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
  }

  const config = getEbayCommerceConfig();
  const connection = await marketplaceConnectionService.getEbayConnection(userId, getEbayEnvironment());
  const missingFields: string[] = [];

  const sku = ebayProductMapper.getSku(product)?.trim();
  const price = ebayProductMapper.getPrice(product)?.trim();
  const quantity = ebayProductMapper.getQuantity(product);
  const images = ebayProductMapper.getImages(product);
  const condition = ebayProductMapper.getCondition(product)?.trim();
  const listingDescription = ebayProductMapper.getListingDescription(product)?.trim();
  const categoryId = product.ebayCategoryId?.trim() || config.categoryId;
  const marketplaceId = product.ebayMarketplaceId?.trim() || config.marketplaceId;
  const currency = product.ebayCurrency?.trim() || config.currency;

  if (!connection || connection.status !== 'connected' || !connection.accessTokenEncrypted) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Reconnect eBay with inventory permissions.');
  }

  const hasInventoryScope = connection.scopes.some((scope) => scope.includes('sell.inventory'));
  if (!hasInventoryScope) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Reconnect eBay with inventory permissions.');
  }

  if (!product.title?.trim()) {
    missingFields.push('title');
  }

  if (!listingDescription) {
    missingFields.push('description');
  }

  if (!sku) {
    missingFields.push('sku');
  }

  if (!price || !Number.isFinite(Number(price)) || Number(price) < 0) {
    missingFields.push('price');
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    missingFields.push('inventory quantity');
  }

  if (images.length === 0) {
    missingFields.push('public image URL');
  }

  if (!categoryId) {
    missingFields.push('categoryId');
  }

  if (!condition) {
    missingFields.push('condition');
  }

  if (!config.merchantLocationKey) {
    missingFields.push('merchant location key');
  }

  if (!config.paymentPolicyId) {
    missingFields.push('payment policy ID');
  }

  if (!config.fulfillmentPolicyId) {
    missingFields.push('fulfillment policy ID');
  }

  if (!config.returnPolicyId) {
    missingFields.push('return policy ID');
  }

  if (!marketplaceId) {
    missingFields.push('marketplace ID');
  }

  if (!currency) {
    missingFields.push('currency');
  }

  if (missingFields.length > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, `eBay sandbox publishing is missing configuration: ${missingFields.join(', ')}.`);
  }

  return product;
};

const isRetryableError = (error: unknown) => {
  if (!(error instanceof ApiError)) {
    return true;
  }

  if (typeof error.details === 'object' && error.details && 'retryable' in error.details) {
    return Boolean((error.details as { retryable?: boolean }).retryable);
  }

  return error.statusCode >= 500 || error.statusCode === 429;
};

const processPullListings = async (job: EbaySyncJobDocument) => {
  const config = getEbayCommerceConfig();
  return ebayClient.request({
    userId: job.userId,
    method: 'GET',
    path: '/sell/inventory/v1/offer',
    operation: 'pull_ebay_listings',
    query: {
      limit: Number(job.payload?.limit ?? 50),
      offset: Number(job.payload?.offset ?? 0),
      marketplace_id: config.marketplaceId
    }
  });
};

const processJob = async (job: EbaySyncJobDocument) => {
  switch (job.operation) {
    case 'sync_product':
      return ebayListingService.syncProductRecord(job.userId, job.productId!);
    case 'sync_inventory':
      return ebayInventoryService.updateInventoryItem(job.userId, job.productId!);
    case 'sync_price':
      return ebayOfferService.updateOffer(job.userId, job.productId!);
    case 'publish_listing':
      return ebayListingService.publishOffer(job.userId, job.productId!);
    case 'end_listing':
      return ebayListingService.endListing(job.userId, job.productId!);
    case 'pull_listings':
      return processPullListings(job);
    default:
      throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported eBay sync operation: ${job.operation}`);
  }
};

const lockNextJob = async () =>
  EbaySyncJobModel.findOneAndUpdate(
    {
      status: 'pending',
      availableAt: { $lte: new Date() }
    },
    {
      $set: {
        status: 'processing',
        startedAt: new Date()
      },
      $inc: {
        attempts: 1
      }
    },
    {
      sort: { createdAt: 1 },
      new: true
    }
  );

const runNextJob = async () => {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const job = await lockNextJob();
    if (!job) {
      return;
    }

    const result = await processJob(job);
    job.status = 'completed';
    job.completedAt = new Date();
    job.result = result.data ? { data: result.data } : { success: result.success };
    await job.save();

    await syncLogService.create({
      userId: job.userId,
      marketplace: 'ebay',
      entityType: 'product',
      entityId: job.productId,
      action: job.operation,
      status: 'success',
      responsePayload: job.result
    });
  } catch (error) {
    logger.error({ err: error }, 'eBay sync job failed');

    if (error instanceof ApiError && typeof error.details === 'object' && error.details && 'operation' in error.details) {
      logger.warn({ details: error.details }, 'eBay sync error was normalized');
    }

    const activeJob = await EbaySyncJobModel.findOne({ status: 'processing' }).sort({ startedAt: -1 });
    if (!activeJob) {
      return;
    }

    const retryable = isRetryableError(error);
    const shouldRetry = retryable && activeJob.attempts < activeJob.maxAttempts;

    activeJob.lastError = error instanceof Error ? error.message : 'Unknown eBay sync error';
    activeJob.status = shouldRetry ? 'pending' : 'failed';
    activeJob.availableAt = shouldRetry ? new Date(Date.now() + getRetryDelay(activeJob.attempts)) : activeJob.availableAt;
    activeJob.result = {
      success: false,
      error: activeJob.lastError,
      retryable
    };
    await activeJob.save();

    await syncLogService.create({
      userId: activeJob.userId,
      marketplace: 'ebay',
      entityType: 'product',
      entityId: activeJob.productId,
      action: activeJob.operation,
      status: shouldRetry ? 'pending' : 'failed',
      errorMessage: activeJob.lastError,
      responsePayload: activeJob.result
    });
  } finally {
    isProcessing = false;
  }
};

const enqueue = async (
  userId: string,
  operation: EbaySyncJobOperation,
  productId?: string,
  payload?: Record<string, unknown>
) => {
  return EbaySyncJobModel.create({
    userId,
    operation,
    productId,
    payload,
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    availableAt: new Date()
  });
};

export const ebaySyncService = {
  async syncProductToEbay(userId: string, productId: string) {
    return enqueue(userId, 'sync_product', productId);
  },

  async syncInventory(userId: string, productId: string) {
    return enqueue(userId, 'sync_inventory', productId);
  },

  async syncPrice(userId: string, productId: string) {
    return enqueue(userId, 'sync_price', productId);
  },

  async publishListing(userId: string, productId: string) {
    await validatePublishReadiness(userId, productId);
    return enqueue(userId, 'publish_listing', productId);
  },

  async endListing(userId: string, productId: string) {
    return enqueue(userId, 'end_listing', productId);
  },

  async pullEbayListings(userId: string, payload?: Record<string, unknown>) {
    return enqueue(userId, 'pull_listings', undefined, payload);
  },

  async getJob(userId: string, jobId: string) {
    const job = await EbaySyncJobModel.findOne({ _id: jobId, userId });
    if (!job) {
      throw new ApiError(httpStatus.NOT_FOUND, 'eBay sync job not found.');
    }

    return job;
  },

  startWorker() {
    if (workerTimer) {
      return;
    }

    workerTimer = setInterval(() => {
      void runNextJob();
    }, WORKER_INTERVAL_MS);
  },

  stopWorker() {
    if (!workerTimer) {
      return;
    }

    clearInterval(workerTimer);
    workerTimer = null;
  }
};
