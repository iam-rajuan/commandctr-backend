import { z } from 'zod';

const disputeStatusSchema = z.enum(['OPEN', 'SUBMITTED', 'WON', 'LOST', 'UNKNOWN']);

export const disputeValidation = {
  listDisputes: z.object({
    query: z.object({
      status: disputeStatusSchema.optional(),
      search: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional()
    })
  })
};
