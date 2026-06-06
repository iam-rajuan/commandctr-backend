import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { adminService } from './admin.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export const adminController = {
  getUsers: asyncHandler(async (_req, res) => {
    const users = await adminService.getUsers();
    res.status(httpStatus.OK).json(ApiResponse.success('Users fetched successfully', users));
  }),
  getUserById: asyncHandler(async (req, res) => {
    const user = await adminService.getUserById(getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('User fetched successfully', user));
  }),
  blockUser: asyncHandler(async (req, res) => {
    const user = await adminService.blockUser(getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('User blocked successfully', user));
  }),
  unblockUser: asyncHandler(async (req, res) => {
    const user = await adminService.unblockUser(getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('User unblocked successfully', user));
  }),
  deleteUser: asyncHandler(async (req, res) => {
    await adminService.deleteUser(getParam(req.params.id));
    res.status(httpStatus.OK).json(ApiResponse.success('User deleted successfully'));
  })
};
