import { HydratedDocument, Types } from 'mongoose';

export type DisputeMarketplace = 'shopify';
export type DisputeStatus = 'OPEN' | 'SUBMITTED' | 'WON' | 'LOST' | 'UNKNOWN';

export interface IDispute {
  userId: string;
  marketplace: DisputeMarketplace;
  localOrderId?: Types.ObjectId | null;
  shopifyOrderId?: string;
  orderName?: string;
  customerName?: string;
  customerEmail?: string;
  disputeId: string;
  status: DisputeStatus | string;
  reason?: string;
  amount?: string;
  currency?: string;
  deadline?: Date;
  evidenceStatus?: string;
  sourceCreatedAt?: Date;
  sourceUpdatedAt?: Date;
  rawShopifyData?: unknown;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DisputeDocument = HydratedDocument<IDispute>;

export interface DisputeStats {
  actionRequired: number;
  activeDisputes: number;
  won: number;
  lost: number;
  submitted: number;
  avgResolutionTimeDays: number | null;
}

export interface DisputeListResult {
  items: Array<Record<string, unknown>>;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: DisputeStats;
}
