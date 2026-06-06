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
    marketplace: { type: String, default: 'shopify' },
    shopifyOrderId: { type: String, required: true },
    orderName: { type: String },
    email: { type: String },
    customerName: { type: String },
    financialStatus: { type: String },
    fulfillmentStatus: { type: String },
    currency: { type: String },
    totalPrice: { type: String },
    subtotalPrice: { type: String },
    totalTax: { type: String },
    processedAt: { type: Date },
    lineItems: { type: [lineItemSchema], default: [] },
    shippingAddress: { type: Schema.Types.Mixed },
    billingAddress: { type: Schema.Types.Mixed },
    rawShopifyData: { type: Schema.Types.Mixed },
    lastSyncedAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

orderSchema.index({ userId: 1, shopifyOrderId: 1 }, { unique: true });

export const OrderModel = model('Order', orderSchema);
