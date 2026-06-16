import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const optionalString = () => z.preprocess(emptyStringToUndefined, z.string().min(1).optional());
const optionalUrl = () => z.preprocess(emptyStringToUndefined, z.string().url().optional());

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
  MONGODB_DNS_SERVERS: optionalString(),
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
  SHOPIFY_SHOP_DOMAIN: optionalString(),
  SHOPIFY_API_VERSION: z.string().min(1).default('2026-04'),
  SHOPIFY_CLIENT_ID: optionalString(),
  SHOPIFY_CLIENT_SECRET: optionalString(),
  SHOPIFY_APP_URL: optionalUrl(),
  SHOPIFY_REDIRECT_URI: optionalUrl(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: optionalString(),
  EBAY_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),
  EBAY_CLIENT_ID: optionalString(),
  EBAY_CLIENT_SECRET: optionalString(),
  EBAY_RU_NAME: optionalString(),
  EBAY_REDIRECT_URI: optionalUrl(),
  EBAY_SCOPES: optionalString(),
  EBAY_API_BASE_URL: optionalUrl(),
  EBAY_MARKETPLACE_ID: optionalString(),
  EBAY_MERCHANT_LOCATION_KEY: optionalString(),
  EBAY_PAYMENT_POLICY_ID: optionalString(),
  EBAY_RETURN_POLICY_ID: optionalString(),
  EBAY_FULFILLMENT_POLICY_ID: optionalString(),
  EBAY_DEFAULT_CATEGORY_ID: optionalString(),
  EBAY_DEFAULT_CURRENCY: optionalString(),
  EBAY_LISTING_FORMAT: optionalString(),
  EBAY_LISTING_DURATION: optionalString(),
  EBAY_DEFAULT_CONDITION: optionalString(),
  EBAY_SANDBOX_CLIENT_ID: optionalString(),
  EBAY_SANDBOX_CLIENT_SECRET: optionalString(),
  EBAY_SANDBOX_RU_NAME: optionalString(),
  EBAY_SANDBOX_REDIRECT_URI: optionalUrl(),
  EBAY_SANDBOX_AUTH_URL: optionalUrl(),
  EBAY_SANDBOX_TOKEN_URL: optionalUrl(),
  EBAY_PRODUCTION_CLIENT_ID: optionalString(),
  EBAY_PRODUCTION_CLIENT_SECRET: optionalString(),
  EBAY_PRODUCTION_RU_NAME: optionalString(),
  EBAY_PRODUCTION_REDIRECT_URI: optionalUrl(),
  EBAY_PRODUCTION_AUTH_URL: optionalUrl(),
  EBAY_PRODUCTION_TOKEN_URL: optionalUrl(),
  ETSY_CLIENT_ID: optionalString(),
  ETSY_REDIRECT_URI: optionalUrl(),
  ETSY_SCOPES: optionalString(),
  ETSY_AUTH_URL: optionalUrl(),
  ETSY_TOKEN_URL: optionalUrl(),
  ETSY_API_BASE_URL: optionalUrl(),
  ETSY_SHARED_SECRET: optionalString(),
  FRONTEND_URL: optionalUrl(),
  ENCRYPTION_SECRET: z.string().min(32)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const flattenedErrors = parsedEnv.error.flatten().fieldErrors;
  throw new Error(`Invalid environment variables: ${JSON.stringify(flattenedErrors)}`);
}

export const env = parsedEnv.data;
