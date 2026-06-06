import cors from 'cors';

import { env } from '@/config/env';

const allowedOrigins = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((item) => item.trim());

export const corsOptions = cors({
  origin: allowedOrigins,
  credentials: true
});
