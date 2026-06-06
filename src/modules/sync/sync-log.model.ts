import { model, Schema } from 'mongoose';

import { SYNC_ENTITY_TYPES, SYNC_STATUSES } from '@/constants/app.constant';

const syncLogSchema = new Schema(
  {
    userId: { type: String, index: true },
    marketplace: { type: String, default: 'shopify' },
    entityType: { type: String, enum: SYNC_ENTITY_TYPES, required: true },
    entityId: { type: String },
    action: { type: String, required: true },
    status: { type: String, enum: SYNC_STATUSES, default: 'pending' },
    message: { type: String },
    requestPayload: { type: Schema.Types.Mixed },
    responsePayload: { type: Schema.Types.Mixed },
    errorMessage: { type: String }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

export const SyncLogModel = model('SyncLog', syncLogSchema, 'sync_logs');
