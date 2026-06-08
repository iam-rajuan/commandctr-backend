import { z } from 'zod';

const orderStatusSchema = z.enum(['Pending', 'Shipped', 'Delivered', 'Cancelled']);

export const orderValidation = {
  listOrders: z.object({
    query: z.object({
      search: z.string().optional(),
      marketplace: z.string().optional(),
      status: orderStatusSchema.optional(),
      page: z.string().optional(),
      limit: z.string().optional()
    })
  }),
  updateStatus: z.object({
    body: z.object({
      status: orderStatusSchema,
      carrier: z.string().trim().optional(),
      shippingService: z.string().trim().optional(),
      trackingNumber: z.string().trim().optional(),
      trackingUrl: z.string().trim().url().optional(),
      labelUrl: z.string().trim().url().optional(),
      notifyCustomer: z.boolean().optional()
    })
  }),
  addNote: z.object({
    body: z.object({
      message: z.string().trim().min(1).max(2000)
    })
  })
};
