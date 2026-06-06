import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { corsOptions } from '@/config/cors';
import { env } from '@/config/env';
import { setupSwagger } from '@/config/swagger';
import { httpStatus } from '@/constants/http.constant';
import { errorMiddleware } from '@/middlewares/error.middleware';
import { notFoundMiddleware } from '@/middlewares/not-found.middleware';
import { requestLoggerMiddleware } from '@/middlewares/request-logger.middleware';
import { apiRouter } from '@/routes';
import { ApiResponse } from '@/shared/api-response';

const app = express();

app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

app.use(helmet());
app.use(corsOptions);
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: ApiResponse.error('Too many requests. Please try again later.')
  })
);
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLoggerMiddleware);

app.get('/', (_req, res) => {
  res
    .status(httpStatus.OK)
    .json(ApiResponse.success('CommandCtr backend is running', { version: '1.0.0' }));
});

setupSwagger(app);
app.use(env.API_PREFIX, apiRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
