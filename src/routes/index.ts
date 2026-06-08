import { Router } from 'express';

import { adminRouter } from '@/modules/admin/admin.route';
import { authRouter } from '@/modules/auth/auth.route';
import { dashboardRouter } from '@/modules/dashboard/dashboard.route';
import { healthRouter } from '@/modules/health/health.route';
import { inventoryRouter } from '@/modules/inventory/inventory.route';
import { marketplaceConnectionRouter } from '@/modules/marketplace-connections/marketplace-connection.route';
import { orderRouter } from '@/modules/orders/order.route';
import { productRouter } from '@/modules/products/product.route';
import { shopifyRouter } from '@/modules/shopify/shopify.route';
import { syncLogRouter } from '@/modules/sync/sync-log.route';
import { userRouter } from '@/modules/users/user.route';
import { walletRouter } from '@/modules/wallet/wallet.route';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/marketplace-connections', marketplaceConnectionRouter);
apiRouter.use('/shopify', shopifyRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/wallet', walletRouter);
apiRouter.use('/sync', syncLogRouter);
