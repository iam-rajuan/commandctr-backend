import { httpStatus } from '@/constants/http.constant';
import { OrderModel } from '@/modules/orders/order.model';
import { ApiError } from '@/shared/api-error';

import { DisputeListResult, DisputeStats } from './dispute.interface';
import { DisputeModel } from './dispute.model';

type DisputeQuery = {
  status?: 'OPEN' | 'SUBMITTED' | 'WON' | 'LOST' | 'UNKNOWN';
  search?: string;
  page?: string;
  limit?: string;
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeStatus = (value: unknown) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'OPEN') {
    return 'OPEN';
  }
  if (normalized === 'SUBMITTED') {
    return 'SUBMITTED';
  }
  if (normalized === 'WON') {
    return 'WON';
  }
  if (normalized === 'LOST') {
    return 'LOST';
  }

  return 'UNKNOWN';
};

const addComputedStatus = <T extends Record<string, unknown>>(dispute: T) => ({
  ...dispute,
  status: normalizeStatus(dispute.status)
});

const buildMatch = (userId: string, query: DisputeQuery) => {
  const match: Record<string, unknown> = { userId, marketplace: 'shopify' };

  if (query.status) {
    match.status = query.status;
  }

  const search = query.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    match.$or = [
      { disputeId: pattern },
      { orderName: pattern },
      { shopifyOrderId: pattern },
      { customerName: pattern },
      { customerEmail: pattern },
      { reason: pattern },
      { status: pattern }
    ];
  }

  return match;
};

const calculateStats = (items: Array<Record<string, unknown>>): DisputeStats => {
  let actionRequired = 0;
  let activeDisputes = 0;
  let won = 0;
  let lost = 0;
  let submitted = 0;
  let resolutionDurationDaysTotal = 0;
  let resolutionDurationCount = 0;

  for (const item of items) {
    const status = normalizeStatus(item.status);
    if (status === 'OPEN') {
      actionRequired += 1;
      activeDisputes += 1;
    } else if (status === 'SUBMITTED') {
      submitted += 1;
      activeDisputes += 1;
    } else if (status === 'WON') {
      won += 1;
    } else if (status === 'LOST') {
      lost += 1;
    }

    if ((status === 'WON' || status === 'LOST') && item.sourceCreatedAt && item.sourceUpdatedAt) {
      const createdAt = new Date(item.sourceCreatedAt as string | Date).getTime();
      const updatedAt = new Date(item.sourceUpdatedAt as string | Date).getTime();
      if (Number.isFinite(createdAt) && Number.isFinite(updatedAt) && updatedAt >= createdAt) {
        resolutionDurationDaysTotal += (updatedAt - createdAt) / (1000 * 60 * 60 * 24);
        resolutionDurationCount += 1;
      }
    }
  }

  return {
    actionRequired,
    activeDisputes,
    won,
    lost,
    submitted,
    avgResolutionTimeDays: resolutionDurationCount
      ? Number((resolutionDurationDaysTotal / resolutionDurationCount).toFixed(1))
      : null
  };
};

export const disputeService = {
  async getDisputes(userId: string, query: DisputeQuery = {}): Promise<DisputeListResult> {
    const page = parsePositiveInt(query.page, 1);
    const limit = Math.min(parsePositiveInt(query.limit, 25), 100);
    const match = buildMatch(userId, query);

    const [matchedItems, allItems] = await Promise.all([
      DisputeModel.find(match).sort({ sourceCreatedAt: -1, updatedAt: -1 }).lean(),
      DisputeModel.find({ userId, marketplace: 'shopify' }).select('status sourceCreatedAt sourceUpdatedAt').lean()
    ]);

    const total = matchedItems.length;
    const items = matchedItems
      .slice((page - 1) * limit, page * limit)
      .map((item) => addComputedStatus({ ...item, id: String(item._id) }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      stats: calculateStats(allItems)
    };
  },

  async getDisputeById(userId: string, disputeId: string) {
    const dispute = await DisputeModel.findOne({ _id: disputeId, userId, marketplace: 'shopify' }).lean();
    if (!dispute) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Dispute not found');
    }

    const relatedOrder = dispute.localOrderId
      ? await OrderModel.findOne({ _id: dispute.localOrderId, userId })
        .select('orderName shopifyOrderId customerName email financialStatus fulfillmentStatus totalPrice currency processedAt')
        .lean()
      : null;

    return {
      dispute: addComputedStatus({ ...dispute, id: String(dispute._id) }),
      relatedOrder: relatedOrder
        ? {
          id: String(relatedOrder._id),
          orderName: relatedOrder.orderName ?? null,
          shopifyOrderId: relatedOrder.shopifyOrderId ?? null,
          customerName: relatedOrder.customerName ?? null,
          customerEmail: relatedOrder.email ?? null,
          financialStatus: relatedOrder.financialStatus ?? null,
          fulfillmentStatus: relatedOrder.fulfillmentStatus ?? null,
          totalPrice: relatedOrder.totalPrice ?? null,
          currency: relatedOrder.currency ?? null,
          processedAt: relatedOrder.processedAt ?? null
        }
        : null
    };
  }
};
