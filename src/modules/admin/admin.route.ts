import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { roleMiddleware } from '@/middlewares/role.middleware';

import { adminController } from './admin.controller';

export const adminRouter = Router();

adminRouter.use(authMiddleware, roleMiddleware('admin', 'super_admin'));
adminRouter.get('/users', adminController.getUsers);
adminRouter.get('/users/:id', adminController.getUserById);
adminRouter.patch('/users/:id/block', adminController.blockUser);
adminRouter.patch('/users/:id/unblock', adminController.unblockUser);
adminRouter.delete('/users/:id', adminController.deleteUser);
