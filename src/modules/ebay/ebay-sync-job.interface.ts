import { HydratedDocument } from 'mongoose';

export type EbaySyncJobOperation =
  | 'sync_product'
  | 'sync_inventory'
  | 'sync_price'
  | 'pull_listings'
  | 'publish_listing'
  | 'end_listing';

export type EbaySyncJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IEbaySyncJob {
  userId: string;
  operation: EbaySyncJobOperation;
  productId?: string;
  status: EbaySyncJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastError?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type EbaySyncJobDocument = HydratedDocument<IEbaySyncJob>;
