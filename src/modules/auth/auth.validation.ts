import { z } from 'zod';

const passwordRule =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export const authValidation = {
  register: z.object({
    body: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.email(),
      password: z
        .string()
        .regex(
          passwordRule,
          'Password must contain uppercase, lowercase, number, special character, and be at least 8 characters.'
        )
    })
  }),
  login: z.object({
    body: z.object({
      email: z.email(),
      password: z.string().min(8)
    })
  }),
  refreshToken: z.object({
    body: z.object({
      refreshToken: z.string().min(1)
    })
  })
};
