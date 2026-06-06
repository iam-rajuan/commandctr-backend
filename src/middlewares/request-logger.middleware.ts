import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';

import { logger } from '@/config/logger';

export const requestLoggerMiddleware: RequestHandler = (req, res, next) => {
  req.requestId = req.headers['x-request-id']?.toString() || randomUUID();
  res.setHeader('x-request-id', req.requestId);

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const durationInMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    logger.info({
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${durationInMs.toFixed(2)}ms`
    });
  });

  next();
};
