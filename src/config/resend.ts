import { env } from '@/config/env';

export const resendConfig = {
  apiKey: env.RESEND_API_KEY,
  fromEmail: env.RESEND_FROM_EMAIL
};
