import bcrypt from 'bcryptjs';

import { connectDatabase } from '@/config/database';
import { logger } from '@/config/logger';
import { UserModel } from '@/modules/users/user.model';

const seedAdmin = async (): Promise<void> => {
  await connectDatabase();

  const email = 'admin@commandctr.com';
  const existingAdmin = await UserModel.findOne({ email });

  if (existingAdmin) {
    logger.info({ email }, 'Default admin already exists');
    process.exit(0);
  }

  await UserModel.create({
    firstName: 'CommandCtr',
    lastName: 'Admin',
    email,
    password: await bcrypt.hash('admin@123', 10),
    role: 'admin',
    status: 'active'
  });

  logger.info({ email }, 'Default admin created successfully');
  process.exit(0);
};

void seedAdmin();
