import mongoose from 'mongoose';

import { env } from '@/config/env';
import { logger } from '@/config/logger';

export const connectDatabase = async (): Promise<typeof mongoose> => {
  try {
    const connection = await mongoose.connect(env.MONGODB_URI);
    logger.info({ database: connection.connection.name }, 'MongoDB connection established');
    return connection;
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
};
