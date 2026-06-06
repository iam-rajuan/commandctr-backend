import { Router } from 'express';

import { authMiddleware } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate-request.middleware';

import { authController } from './auth.controller';
import { authValidation } from './auth.validation';

export const authRouter = Router();

authRouter.post('/register', validateRequest(authValidation.register), authController.register);
authRouter.post('/login', validateRequest(authValidation.login), authController.login);
authRouter.post('/refresh-token', validateRequest(authValidation.refreshToken), authController.refreshToken);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authMiddleware, authController.me);
