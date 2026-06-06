import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TRUST_PROXY: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') {
        return value;
      }

      if (value === undefined) {
        return undefined;
      }

      return value === 'true' || value === '1';
    }),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().min(1).default('/api/v1'),
  MONGODB_URI: z.string().min(1),
  MONGODB_DNS_SERVERS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AWS_REGION: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.email(),
  SHOPIFY_SHOP_DOMAIN: z.string().min(1).optional(),
  SHOPIFY_API_VERSION: z.string().min(1).default('2026-04'),
  SHOPIFY_CLIENT_ID: z.string().min(1).optional(),
  SHOPIFY_CLIENT_SECRET: z.string().min(1).optional(),
  SHOPIFY_APP_URL: z.string().url().optional(),
  SHOPIFY_REDIRECT_URI: z.string().url().optional(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().min(1).optional(),
  FRONTEND_URL: z.string().url().optional(),
  ENCRYPTION_SECRET: z.string().min(32)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const flattenedErrors = parsedEnv.error.flatten().fieldErrors;
  throw new Error(`Invalid environment variables: ${JSON.stringify(flattenedErrors)}`);
}

export const env = parsedEnv.data;
