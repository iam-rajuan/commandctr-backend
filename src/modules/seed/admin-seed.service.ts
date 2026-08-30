import bcrypt from 'bcryptjs';

import { logger } from '@/config/logger';
import { UserModel } from '@/modules/users/user.model';

const DEFAULT_ADMIN = {
  firstName: 'CommandCtr',
  lastName: 'Admin',
  email: 'admin@commandctr.com',
  password: 'admin@123',
  role: 'admin' as const,
  status: 'active' as const
};

export const ensureDefaultAdmin = async (): Promise<void> => {
  const existingAdmin = await UserModel.findOne({ email: DEFAULT_ADMIN.email });

  if (existingAdmin) {
    logger.info({ email: DEFAULT_ADMIN.email }, 'Default admin already exists; skipping seed');
    return;
  }

  await UserModel.create({
    ...DEFAULT_ADMIN,
    password: await bcrypt.hash(DEFAULT_ADMIN.password, 10)
  });

  logger.info({ email: DEFAULT_ADMIN.email }, 'Default admin created successfully');
};
