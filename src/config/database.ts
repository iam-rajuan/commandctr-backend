import dns from 'node:dns';

import mongoose from 'mongoose';

import { env } from '@/config/env';
import { logger } from '@/config/logger';

const DEFAULT_PUBLIC_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

const getMongoDnsFallbackServers = (): string[] => {
  const configuredServers = env.MONGODB_DNS_SERVERS?.split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  return configuredServers?.length ? configuredServers : DEFAULT_PUBLIC_DNS_SERVERS;
};

const shouldRetryWithPublicDns = (error: unknown): error is NodeJS.ErrnoException =>
  Boolean(
    env.MONGODB_URI.startsWith('mongodb+srv://') &&
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ECONNREFUSED' &&
      'syscall' in error &&
      error.syscall === 'querySrv'
  );

export const connectDatabase = async (): Promise<typeof mongoose> => {
  try {
    const connection = await mongoose.connect(env.MONGODB_URI);
    logger.info({ database: connection.connection.name }, 'MongoDB connection established');
    return connection;
  } catch (error) {
    if (shouldRetryWithPublicDns(error)) {
      const fallbackDnsServers = getMongoDnsFallbackServers();

      logger.warn(
        {
          dnsServers: dns.getServers(),
          fallbackDnsServers
        },
        'MongoDB SRV lookup failed; retrying with fallback DNS servers'
      );

      dns.setServers(fallbackDnsServers);

      try {
        const connection = await mongoose.connect(env.MONGODB_URI);
        logger.info(
          { database: connection.connection.name, dnsServers: dns.getServers() },
          'MongoDB connection established after DNS fallback'
        );
        return connection;
      } catch (retryError) {
        logger.error({ err: retryError, dnsServers: dns.getServers() }, 'MongoDB connection failed after DNS fallback');
        throw retryError;
      }
    }

    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
};
