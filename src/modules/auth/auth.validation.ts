import { z } from 'zod';

export const authValidation = {
  login: z.object({
    body: z.object({
      email: z.email(),
      password: z.string().min(8)
    })
  })
};
