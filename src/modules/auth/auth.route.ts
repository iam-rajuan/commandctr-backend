import { Router } from 'express';

import { getAuthPlaceholder } from './auth.controller';

export const authRouter = Router();

authRouter.get('/', getAuthPlaceholder);
