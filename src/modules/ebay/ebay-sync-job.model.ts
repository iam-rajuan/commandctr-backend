import { model, Schema } from 'mongoose';

import { IEbaySyncJob } from './ebay-sync-job.interface';

const ebaySyncJobSchema = new Schema<IEbaySyncJob>(
  {
    userId: { type: String, required: true, index: true },
    operation: {
      type: String,
      enum: ['sync_product', 'sync_inventory', 'sync_price', 'pull_listings', 'publish_listing', 'end_listing'],
      required: true
    },
    productId: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true
    },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    availableAt: { type: Date, default: Date.now, index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    lastError: { type: String },
    payload: { type: Schema.Types.Mixed },
    result: { type: Schema.Types.Mixed }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

ebaySyncJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });

export const EbaySyncJobModel = model<IEbaySyncJob>('EbaySyncJob', ebaySyncJobSchema);
