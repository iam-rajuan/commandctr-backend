import { APP_NAME } from '@/constants/app.constant';

export const healthService = {
  getHealthStatus: () => ({
    service: APP_NAME,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  })
};
