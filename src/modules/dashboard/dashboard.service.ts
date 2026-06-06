import { InventoryModel } from '@/modules/inventory/inventory.model';
import { OrderModel } from '@/modules/orders/order.model';
import { ProductModel } from '@/modules/products/product.model';
import { shopifyService } from '@/modules/shopify/shopify.service';
import { SyncLogModel } from '@/modules/sync/sync-log.model';

export const dashboardService = {
  async getOverview(userId: string) {
    const [totalProducts, totalOrders, lowStock, syncErrors] = await Promise.all([
      ProductModel.countDocuments({ userId }),
      OrderModel.countDocuments({ userId }),
      InventoryModel.countDocuments({ userId, $expr: { $lte: ['$availableQuantity', '$lowStockThreshold'] } }),
      SyncLogModel.countDocuments({ userId, status: 'failed' })
    ]);

    return {
      totalProducts,
      totalOrders,
      lowStock,
      syncErrors,
      connectedMarketplace: 'shopify',
      shopifyConnectionStatus: shopifyService.getConnectionState()
    };
  }
};
