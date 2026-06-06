import { z } from 'zod';

const passwordRule =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export const userValidation = {
  updateProfile: z.object({
    body: z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      avatar: z.string().url().optional(),
      phone: z.string().min(5).optional()
    })
  }),
  changePassword: z.object({
    body: z.object({
      currentPassword: z.string().min(8),
      newPassword: z
        .string()
        .regex(
          passwordRule,
          'Password must contain uppercase, lowercase, number, special character, and be at least 8 characters.'
        )
    })
  })
};
