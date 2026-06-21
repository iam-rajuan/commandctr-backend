import mongoose from 'mongoose';

import { connectDatabase } from '@/config/database';
import { logger } from '@/config/logger';
import { ProductModel } from '@/modules/products/product.model';
import { UserModel } from '@/modules/users/user.model';

import { getEbayCommerceConfig } from '../ebay.client';

const ADMIN_EMAIL = 'admin@commandctr.com';

/**
 * P0 data cleanup: clear stale eBay offer/listing references left over from US (or any
 * previous-seller) testing so that the next publish recreates a fresh offer under the
 * active UK/GB seller. This intentionally does NOT touch products, Shopify data, or
 * core inventory/product fields — only the eBay channel pointers.
 */
const clearStaleEbayFields = async (): Promise<void> => {
  await connectDatabase();

  const activeMarketplaceId = getEbayCommerceConfig().marketplaceId;
  logger.info({ activeMarketplaceId }, 'Clearing stale eBay fields for active marketplace');

  const admin = await UserModel.findOne({ email: ADMIN_EMAIL }).select('_id');
  if (!admin) {
    logger.error({ email: ADMIN_EMAIL }, 'Admin user not found; aborting cleanup');
    process.exit(1);
  }

  const userId = admin._id.toString();

  // 1. Always clear stale offer/listing pointers for this user's eBay products.
  const clearedOffers = await ProductModel.updateMany(
    {
      userId,
      $or: [
        { ebayOfferId: { $exists: true, $nin: [null, ''] } },
        { ebayListingId: { $exists: true, $nin: [null, ''] } }
      ]
    },
    { $unset: { ebayOfferId: '', ebayListingId: '' } }
  );

  // 2. Clear ebayMarketplaceId ONLY when it mismatches the active marketplace,
  //    so the mapper falls back to the active EBAY_GB config.
  const clearedMarketplace = await ProductModel.updateMany(
    {
      userId,
      ebayMarketplaceId: { $exists: true, $nin: [null, '', activeMarketplaceId] }
    },
    { $unset: { ebayMarketplaceId: '' } }
  );

  logger.info(
    {
      userId,
      activeMarketplaceId,
      offersListingsCleared: clearedOffers.modifiedCount,
      mismatchedMarketplaceCleared: clearedMarketplace.modifiedCount
    },
    'Stale eBay field cleanup complete'
  );

  await mongoose.disconnect();
  process.exit(0);
};

void clearStaleEbayFields().catch((error) => {
  logger.error({ err: error }, 'Failed to clear stale eBay fields');
  process.exit(1);
});
