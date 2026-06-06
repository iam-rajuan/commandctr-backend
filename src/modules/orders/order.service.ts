import { httpStatus } from '@/constants/http.constant';
import { ApiError } from '@/shared/api-error';

import { OrderModel } from './order.model';

export const orderService = {
  async getOrders(userId: string) {
    return OrderModel.find({ userId }).sort({ processedAt: -1 });
  },
  async getOrderById(userId: string, orderId: string) {
    const order = await OrderModel.findOne({ _id: orderId, userId });
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    return order;
  }
};
