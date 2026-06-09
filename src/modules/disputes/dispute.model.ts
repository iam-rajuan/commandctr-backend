import { model, Schema, Types } from 'mongoose';

const disputeSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    marketplace: { type: String, default: 'shopify', index: true },
    localOrderId: { type: Types.ObjectId, ref: 'Order', default: null },
    shopifyOrderId: { type: String, index: true },
    orderName: { type: String },
    customerName: { type: String },
    customerEmail: { type: String },
    disputeId: { type: String, required: true, index: true },
    status: { type: String, required: true },
    reason: { type: String },
    amount: { type: String },
    currency: { type: String },
    deadline: { type: Date },
    evidenceStatus: { type: String },
    sourceCreatedAt: { type: Date },
    sourceUpdatedAt: { type: Date },
    rawShopifyData: { type: Schema.Types.Mixed },
    lastSyncedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

disputeSchema.index({ userId: 1, marketplace: 1, disputeId: 1 }, { unique: true });

export const DisputeModel = model('Dispute', disputeSchema);
