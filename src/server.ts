import mongoose from 'mongoose';

import { app } from '@/app';
import { connectDatabase } from '@/config/database';
import { env } from '@/config/env';
import { logger } from '@/config/logger';

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    const server = app.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          environment: env.NODE_ENV
        },
        'CommandCtr backend server started'
      );
    });

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      logger.warn({ signal }, 'Shutdown signal received');

      server.close((error?: Error) => {
        if (error) {
          logger.error({ err: error }, 'Failed to close HTTP server gracefully');
          process.exit(1);
        }

        void mongoose.connection.close().then(() => {
          logger.info('HTTP server and MongoDB connection closed');
          process.exit(0);
        });
      });
    };

    process.on('SIGINT', (signal) => {
      void shutdown(signal);
    });
    process.on('SIGTERM', (signal) => {
      void shutdown(signal);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Unable to start CommandCtr backend');
    process.exit(1);
  }
};

void startServer();
