import { z } from 'zod';

export const productValidation = {
  updateProduct: z.object({
    body: z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional()
    })
  })
};
