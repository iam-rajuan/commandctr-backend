import { env } from '@/config/env';

export const s3Config = {
  region: env.AWS_REGION,
  bucketName: env.AWS_S3_BUCKET,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY
};
