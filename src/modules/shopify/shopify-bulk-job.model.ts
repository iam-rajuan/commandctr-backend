import { model, Schema } from 'mongoose';

import { IShopifyBulkJob } from './shopify-bulk-job.interface';

const rowResultSchema = new Schema(
  {
    line: { type: Number, required: true },
    productId: { type: String },
    errors: { type: [String], default: [] }
  },
  { _id: false, suppressReservedKeysWarning: true }
);

const shopifyBulkJobSchema = new Schema<IShopifyBulkJob>(
  {
    userId: { type: String, required: true, index: true },
    shopDomain: { type: String, required: true, index: true },
    status: { type: String, enum: ['created', 'running', 'completed', 'failed', 'canceled'], required: true, index: true },
    operationId: { type: String, index: true },
    operationStatus: { type: String },
    totalRows: { type: Number, required: true, min: 1 },
    processedRows: { type: Number, default: 0, min: 0 },
    succeededRows: { type: Number, default: 0, min: 0 },
    failedRows: { type: Number, default: 0, min: 0 },
    publishToOnlineStore: { type: Boolean, default: false },
    resultUrl: { type: String },
    partialDataUrl: { type: String },
    rows: { type: [rowResultSchema], default: [] },
    lastError: { type: String },
    completedAt: { type: Date }
  },
  { timestamps: true, versionKey: false, suppressReservedKeysWarning: true }
);

shopifyBulkJobSchema.index({ userId: 1, createdAt: -1 });
shopifyBulkJobSchema.index({ shopDomain: 1, status: 1 });

export const ShopifyBulkJobModel = model<IShopifyBulkJob>('ShopifyBulkJob', shopifyBulkJobSchema);
