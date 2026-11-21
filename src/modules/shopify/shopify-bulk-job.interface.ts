import { HydratedDocument } from 'mongoose';

export type ShopifyBulkJobStatus = 'created' | 'running' | 'completed' | 'failed' | 'canceled';

export interface ShopifyBulkJobRowResult {
  line: number;
  productId?: string;
  errors: string[];
}

export interface IShopifyBulkJob {
  userId: string;
  shopDomain: string;
  status: ShopifyBulkJobStatus;
  operationId?: string;
  operationStatus?: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  publishToOnlineStore: boolean;
  resultUrl?: string;
  partialDataUrl?: string;
  rows: ShopifyBulkJobRowResult[];
  lastError?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ShopifyBulkJobDocument = HydratedDocument<IShopifyBulkJob>;
