import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { orderService } from './order.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export const orderController = {
  getOrders: asyncHandler(async (req, res) => {
    const orders = await orderService.getOrders(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Orders fetched successfully', orders));
  }),
  getOrderById: asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(req.user!.userId, getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('Order fetched successfully', order));
  })
};
