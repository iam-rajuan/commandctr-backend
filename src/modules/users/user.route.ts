import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { userController } from './user.controller';
import { userValidation } from './user.validation';

export const userRouter = Router();

userRouter.use(authMiddleware);
userRouter.get('/profile', userController.getProfile);
userRouter.patch('/profile', validateRequest(userValidation.updateProfile), userController.updateProfile);
userRouter.patch('/change-password', validateRequest(userValidation.changePassword), userController.changePassword);
