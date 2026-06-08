import { model, Schema } from 'mongoose';

const lineItemSchema = new Schema(
  {
    title: { type: String },
    sku: { type: String },
    quantity: { type: Number },
    price: { type: String },
    shopifyVariantId: { type: String },
    shopifyProductId: { type: String }
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    marketplace: { type: String, default: 'shopify', index: true },
    externalOrderId: { type: String },
    shopifyOrderId: { type: String },
    orderName: { type: String },
    email: { type: String },
    customerName: { type: String },
    phone: { type: String },
    financialStatus: { type: String },
    fulfillmentStatus: { type: String },
    statusOverride: { type: String },
    currency: { type: String },
    totalPrice: { type: String },
    subtotalPrice: { type: String },
    totalTax: { type: String },
    processedAt: { type: Date },
    lineItems: { type: [lineItemSchema], default: [] },
    shippingAddress: { type: Schema.Types.Mixed },
    billingAddress: { type: Schema.Types.Mixed },
    carrier: { type: String },
    shippingService: { type: String },
    trackingNumber: { type: String },
    trackingUrl: { type: String },
    labelUrl: { type: String },
    shippedAt: { type: Date },
    cancelledAt: { type: Date },
    isSandbox: { type: Boolean, default: false, index: true },
    internalNotes: {
      type: [
        {
          message: { type: String, required: true },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    rawShopifyData: { type: Schema.Types.Mixed },
    lastSyncedAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

orderSchema.index(
  { userId: 1, shopifyOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { shopifyOrderId: { $type: 'string' } }
  }
);
orderSchema.index(
  { userId: 1, externalOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalOrderId: { $type: 'string' } }
  }
);
orderSchema.index({ userId: 1, processedAt: -1 });

export const OrderModel = model('Order', orderSchema);
