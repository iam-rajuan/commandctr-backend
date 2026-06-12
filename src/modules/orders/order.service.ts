import { httpStatus } from '@/constants/http.constant';
import { logger } from '@/config/logger';
import { ApiError } from '@/shared/api-error';

import { OrderModel } from './order.model';

type OrderStatus = 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled';

type OrderQuery = {
  search?: string;
  marketplace?: string;
  status?: OrderStatus;
  page?: string;
  limit?: string;
};

type UpdateOrderStatusPayload = {
  status: OrderStatus;
  carrier?: string;
  shippingService?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  notifyCustomer?: boolean;
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getOrderStatus = (order: {
  statusOverride?: string | null;
  fulfillmentStatus?: string | null;
  financialStatus?: string | null;
  cancelledAt?: Date | string | null;
}): OrderStatus => {
  if (order.cancelledAt || order.statusOverride === 'Cancelled') {
    return 'Cancelled';
  }

  if (order.statusOverride === 'Delivered') {
    return 'Delivered';
  }

  if (order.statusOverride === 'Shipped') {
    return 'Shipped';
  }

  const fulfillmentStatus = (order.fulfillmentStatus ?? '').toUpperCase();
  if (['FULFILLED', 'SHIPPED'].includes(fulfillmentStatus)) {
    return 'Shipped';
  }

  return 'Pending';
};

const buildSearchMatch = (userId: string, query: OrderQuery) => {
  const match: Record<string, unknown> = { userId };
  const marketplace = query.marketplace?.trim().toLowerCase();

  if (marketplace && marketplace !== 'all') {
    match.marketplace = marketplace;
  }

  const search = query.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    match.$or = [
      { orderName: pattern },
      { externalOrderId: pattern },
      { shopifyOrderId: pattern },
      { customerName: pattern },
      { email: pattern },
      { 'lineItems.title': pattern },
      { 'lineItems.sku': pattern }
    ];
  }

  return match;
};

const addComputedStatus = <T extends Record<string, unknown>>(order: T) => ({
  ...order,
  status: getOrderStatus(order)
});

const escapeCsvValue = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const ensureOrderIndexes = async () => {
  const indexes = await OrderModel.collection.indexes();
  const shopifyOrderIndex = indexes.find((index) => index.name === 'userId_1_shopifyOrderId_1');
  const externalOrderIndex = indexes.find((index) => index.name === 'userId_1_externalOrderId_1');

  if (shopifyOrderIndex && !shopifyOrderIndex.partialFilterExpression) {
    await OrderModel.collection.dropIndex('userId_1_shopifyOrderId_1');
  }

  if (externalOrderIndex && !externalOrderIndex.partialFilterExpression) {
    await OrderModel.collection.dropIndex('userId_1_externalOrderId_1');
  }

  await OrderModel.collection.createIndex(
    { userId: 1, shopifyOrderId: 1 },
    {
      unique: true,
      name: 'userId_1_shopifyOrderId_1',
      partialFilterExpression: { shopifyOrderId: { $type: 'string' } }
    }
  );
  await OrderModel.collection.createIndex(
    { userId: 1, externalOrderId: 1 },
    {
      unique: true,
      name: 'userId_1_externalOrderId_1',
      partialFilterExpression: { externalOrderId: { $type: 'string' } }
    }
  );
};

const syncConnectedMarketplaceOrders = async (userId: string) => {
  try {
    const { shopifyService } = await import('@/modules/shopify/shopify.service');
    await shopifyService.importOrders(userId);
  } catch (error) {
    if (error instanceof ApiError && error.message === 'Shopify store is not connected.') {
      return;
    }

    logger.error(
      {
        userId,
        message: error instanceof Error ? error.message : 'Unknown Shopify order sync failure'
      },
      'Shopify order auto-sync failed'
    );

    throw error;
  }
};

const buildSandboxOrders = (userId: string) => {
  const now = Date.now();

  return [
    {
      userId,
      marketplace: 'amazon',
      externalOrderId: 'SANDBOX-AMZ-1001',
      shopifyOrderId: 'SANDBOX-AMZ-1001',
      orderName: '#SBX-1001',
      email: 'jane.cooper@example.com',
      customerName: 'Jane Cooper',
      phone: '+1 (555) 010-1001',
      financialStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      statusOverride: 'Pending',
      currency: 'USD',
      totalPrice: '129.97',
      subtotalPrice: '119.98',
      totalTax: '9.99',
      processedAt: new Date(now - 1000 * 60 * 35),
      lineItems: [
        {
          title: 'Performance Golf Glove',
          sku: 'SBX-GLOVE-M',
          quantity: 2,
          price: '24.99'
        },
        {
          title: 'Alignment Putting Mirror',
          sku: 'SBX-MIRROR-01',
          quantity: 1,
          price: '79.99'
        }
      ],
      shippingAddress: {
        name: 'Jane Cooper',
        address1: '4140 Parker Rd.',
        city: 'Allentown',
        province: 'NM',
        zip: '31134',
        country: 'United States',
        phone: '+1 (555) 010-1001',
        formatted: ['Jane Cooper', '4140 Parker Rd.', 'Allentown, NM 31134', 'United States']
      },
      billingAddress: {
        name: 'Jane Cooper',
        address1: '4140 Parker Rd.',
        city: 'Allentown',
        province: 'NM',
        zip: '31134',
        country: 'United States',
        formatted: ['Jane Cooper', '4140 Parker Rd.', 'Allentown, NM 31134', 'United States']
      },
      isSandbox: true,
      lastSyncedAt: new Date()
    },
    {
      userId,
      marketplace: 'ebay',
      externalOrderId: 'SANDBOX-EBY-1002',
      shopifyOrderId: 'SANDBOX-EBY-1002',
      orderName: '#SBX-1002',
      email: 'wade.warren@example.com',
      customerName: 'Wade Warren',
      phone: '+1 (555) 010-1002',
      financialStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
      statusOverride: 'Shipped',
      currency: 'USD',
      totalPrice: '59.50',
      subtotalPrice: '55.00',
      totalTax: '4.50',
      processedAt: new Date(now - 1000 * 60 * 60 * 5),
      lineItems: [
        {
          title: 'Golf Ball Retriever',
          sku: 'SBX-RETRIEVE-12',
          quantity: 1,
          price: '55.00'
        }
      ],
      shippingAddress: {
        name: 'Wade Warren',
        address1: '2715 Ash Dr.',
        city: 'Austin',
        province: 'TX',
        zip: '73301',
        country: 'United States',
        phone: '+1 (555) 010-1002',
        formatted: ['Wade Warren', '2715 Ash Dr.', 'Austin, TX 73301', 'United States']
      },
      billingAddress: {
        name: 'Wade Warren',
        address1: '2715 Ash Dr.',
        city: 'Austin',
        province: 'TX',
        zip: '73301',
        country: 'United States',
        formatted: ['Wade Warren', '2715 Ash Dr.', 'Austin, TX 73301', 'United States']
      },
      carrier: 'UPS',
      shippingService: 'Ground',
      trackingNumber: '1Z999AA10123456784',
      shippedAt: new Date(now - 1000 * 60 * 60 * 2),
      isSandbox: true,
      lastSyncedAt: new Date()
    },
    {
      userId,
      marketplace: 'tiktok',
      externalOrderId: 'SANDBOX-TTK-1003',
      shopifyOrderId: 'SANDBOX-TTK-1003',
      orderName: '#SBX-1003',
      email: 'jenny.wilson@example.com',
      customerName: 'Jenny Wilson',
      phone: '+1 (555) 010-1003',
      financialStatus: 'PAID',
      fulfillmentStatus: 'DELIVERED',
      statusOverride: 'Delivered',
      currency: 'USD',
      totalPrice: '214.25',
      subtotalPrice: '198.00',
      totalTax: '16.25',
      processedAt: new Date(now - 1000 * 60 * 60 * 24),
      lineItems: [
        {
          title: 'Adjustable Golf Practice Net',
          sku: 'SBX-NET-PRO',
          quantity: 1,
          price: '198.00'
        }
      ],
      shippingAddress: {
        name: 'Jenny Wilson',
        address1: '1901 Market St.',
        city: 'Philadelphia',
        province: 'PA',
        zip: '19103',
        country: 'United States',
        phone: '+1 (555) 010-1003',
        formatted: ['Jenny Wilson', '1901 Market St.', 'Philadelphia, PA 19103', 'United States']
      },
      billingAddress: {
        name: 'Jenny Wilson',
        address1: '1901 Market St.',
        city: 'Philadelphia',
        province: 'PA',
        zip: '19103',
        country: 'United States',
        formatted: ['Jenny Wilson', '1901 Market St.', 'Philadelphia, PA 19103', 'United States']
      },
      carrier: 'USPS',
      shippingService: 'Priority Mail',
      trackingNumber: '9400111899560000000000',
      shippedAt: new Date(now - 1000 * 60 * 60 * 21),
      isSandbox: true,
      lastSyncedAt: new Date()
    },
    {
      userId,
      marketplace: 'etsy',
      externalOrderId: 'SANDBOX-ETS-1004',
      shopifyOrderId: 'SANDBOX-ETS-1004',
      orderName: '#SBX-1004',
      email: 'leslie.alexander@example.com',
      customerName: 'Leslie Alexander',
      phone: '+1 (555) 010-1004',
      financialStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      statusOverride: 'Pending',
      currency: 'USD',
      totalPrice: '78.50',
      subtotalPrice: '72.00',
      totalTax: '6.50',
      processedAt: new Date(now - 1000 * 60 * 60 * 12),
      lineItems: [
        {
          title: 'Premium Leather Headcover',
          sku: 'SBX-COVER-LH',
          quantity: 1,
          price: '72.00'
        }
      ],
      shippingAddress: {
        name: 'Leslie Alexander',
        address1: '3890 19th St.',
        city: 'San Francisco',
        province: 'CA',
        zip: '94114',
        country: 'United States',
        phone: '+1 (555) 010-1004',
        formatted: ['Leslie Alexander', '3890 19th St.', 'San Francisco, CA 94114', 'United States']
      },
      billingAddress: {
        name: 'Leslie Alexander',
        address1: '3890 19th St.',
        city: 'San Francisco',
        province: 'CA',
        zip: '94114',
        country: 'United States',
        formatted: ['Leslie Alexander', '3890 19th St.', 'San Francisco, CA 94114', 'United States']
      },
      isSandbox: true,
      lastSyncedAt: new Date()
    }
  ];
};

export const orderService = {
  async seedSandboxOrders(userId: string) {
    await ensureOrderIndexes();
    const sandboxOrders = buildSandboxOrders(userId);

    for (const order of sandboxOrders) {
      await OrderModel.findOneAndUpdate(
        { userId, externalOrderId: order.externalOrderId },
        { $set: order },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return this.getOrders(userId, { page: '1', limit: '100' });
  },

  async getOrders(userId: string, query: OrderQuery = {}) {
    await syncConnectedMarketplaceOrders(userId);
    const page = parsePositiveInt(query.page, 1);
    const limit = Math.min(parsePositiveInt(query.limit, 25), 100);
    const match = buildSearchMatch(userId, query);
    const orders = await OrderModel.find(match).sort({ processedAt: -1, createdAt: -1 }).lean();
    const filteredOrders = query.status
      ? orders.filter((order) => getOrderStatus(order) === query.status)
      : orders;
    const total = filteredOrders.length;
    const items = filteredOrders.slice((page - 1) * limit, page * limit).map(addComputedStatus);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      stats: await this.getOrderStats(userId)
    };
  },

  async getOrderStats(userId: string) {
    const orders = await OrderModel.find({ userId }).select('statusOverride fulfillmentStatus financialStatus cancelledAt').lean();
    const stats = {
      totalOrders: orders.length,
      pending: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0
    };

    for (const order of orders) {
      const status = getOrderStatus(order);
      if (status === 'Pending') {
        stats.pending += 1;
      } else if (status === 'Shipped') {
        stats.shipped += 1;
      } else if (status === 'Delivered') {
        stats.delivered += 1;
      } else if (status === 'Cancelled') {
        stats.cancelled += 1;
      }
    }

    return stats;
  },

  async getOrderById(userId: string, orderId: string) {
    const order = await OrderModel.findOne({ _id: orderId, userId }).lean();
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    return addComputedStatus(order);
  },

  async addNote(userId: string, orderId: string, message: string) {
    const order = await OrderModel.findOneAndUpdate(
      { _id: orderId, userId },
      {
        $push: {
          internalNotes: {
            message,
            createdAt: new Date()
          }
        }
      },
      { new: true }
    ).lean();

    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    return addComputedStatus(order);
  },

  async updateOrderStatus(userId: string, orderId: string, payload: UpdateOrderStatusPayload) {
    const existingOrder = await OrderModel.findOne({ _id: orderId, userId });
    if (!existingOrder) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    const updates: Record<string, unknown> = {
      statusOverride: payload.status,
      carrier: payload.carrier,
      shippingService: payload.shippingService,
      trackingNumber: payload.trackingNumber,
      trackingUrl: payload.trackingUrl,
      labelUrl: payload.labelUrl,
      lastSyncedAt: new Date()
    };

    if (payload.status === 'Shipped') {
      updates.fulfillmentStatus = 'FULFILLED';
      updates.shippedAt = new Date();
    }

    if (payload.status === 'Cancelled') {
      updates.cancelledAt = new Date();
    }

    if (
      payload.status === 'Shipped' &&
      existingOrder.marketplace === 'shopify' &&
      existingOrder.shopifyOrderId &&
      payload.trackingNumber
    ) {
      const { shopifyService } = await import('@/modules/shopify/shopify.service');
      await shopifyService.markOrderAsShipped(userId, existingOrder.shopifyOrderId, {
        carrier: payload.carrier,
        trackingNumber: payload.trackingNumber,
        trackingUrl: payload.trackingUrl,
        notifyCustomer: payload.notifyCustomer ?? true
      });
    }

    const order = await OrderModel.findOneAndUpdate({ _id: orderId, userId }, { $set: updates }, { new: true }).lean();
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    return addComputedStatus(order);
  },

  async exportOrdersCsv(userId: string, query: OrderQuery = {}) {
    const result = await this.getOrders(userId, {
      ...query,
      page: '1',
      limit: '100'
    });

    const header = [
      'Order ID',
      'Marketplace',
      'Customer',
      'Email',
      'Items',
      'Amount',
      'Currency',
      'Financial Status',
      'Fulfillment Status',
      'Status',
      'Carrier',
      'Tracking Number',
      'Date'
    ];

    const rows = result.items.map((order) => [
      order.orderName ?? order.externalOrderId ?? order.shopifyOrderId ?? '',
      order.marketplace ?? '',
      order.customerName ?? '',
      order.email ?? '',
      Array.isArray(order.lineItems)
        ? order.lineItems.reduce((sum, item) => sum + (typeof item.quantity === 'number' ? item.quantity : 0), 0)
        : 0,
      order.totalPrice ?? '',
      order.currency ?? '',
      order.financialStatus ?? '',
      order.fulfillmentStatus ?? '',
      order.status ?? '',
      order.carrier ?? '',
      order.trackingNumber ?? '',
      order.processedAt ? new Date(order.processedAt as unknown as string | Date).toISOString() : ''
    ]);

    return [header, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  }
};
