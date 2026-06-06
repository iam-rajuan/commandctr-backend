import { connectDatabase } from '@/config/database';
import { logger } from '@/config/logger';
import { ensureDefaultAdmin } from './admin-seed.service';

const seedAdmin = async (): Promise<void> => {
  await connectDatabase();
  await ensureDefaultAdmin();
  process.exit(0);
};

void seedAdmin().catch((error) => {
  logger.error({ err: error }, 'Failed to seed default admin');
  process.exit(1);
});
