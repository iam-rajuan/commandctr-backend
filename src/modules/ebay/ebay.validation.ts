import { z } from 'zod';

export const ebayValidation = {
  productParams: z.object({
    params: z.object({
      productId: z.string().min(1)
    })
  }),
  jobParams: z.object({
    params: z.object({
      jobId: z.string().min(1)
    })
  }),
  pullListings: z.object({
    body: z.object({
      limit: z.number().int().positive().max(200).optional(),
      offset: z.number().int().min(0).optional()
    })
  })
};
