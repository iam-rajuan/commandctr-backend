import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { orderService } from './order.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export const orderController = {
  seedSandboxOrders: asyncHandler(async (req, res) => {
    const orders = await orderService.seedSandboxOrders(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Sandbox orders created successfully', orders));
  }),
  getOrders: asyncHandler(async (req, res) => {
    const orders = await orderService.getOrders(req.user!.userId, req.query);
    res.status(httpStatus.OK).json(ApiResponse.success('Orders fetched successfully', orders));
  }),
  getOrderStats: asyncHandler(async (req, res) => {
    const stats = await orderService.getOrderStats(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Order stats fetched successfully', stats));
  }),
  exportOrdersCsv: asyncHandler(async (req, res) => {
    const csv = await orderService.exportOrdersCsv(req.user!.userId, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(httpStatus.OK).send(csv);
  }),
  getOrderById: asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(req.user!.userId, getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('Order fetched successfully', order));
  }),
  updateOrderStatus: asyncHandler(async (req, res) => {
    const order = await orderService.updateOrderStatus(req.user!.userId, getParam(req.params.id), req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Order status updated successfully', order));
  }),
  addNote: asyncHandler(async (req, res) => {
    const order = await orderService.addNote(req.user!.userId, getParam(req.params.id), req.body.message);
    res.status(httpStatus.OK).json(ApiResponse.success('Order note added successfully', order));
  })
};
