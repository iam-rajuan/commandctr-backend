import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { userService } from './user.service';

export const userController = {
  getProfile: asyncHandler(async (req, res) => {
    const profile = await userService.getProfile(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Profile fetched successfully', profile));
  }),
  updateProfile: asyncHandler(async (req, res) => {
    const profile = await userService.updateProfile(req.user!.userId, req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Profile updated successfully', profile));
  }),
  changePassword: asyncHandler(async (req, res) => {
    await userService.changePassword(req.user!.userId, req.body.currentPassword, req.body.newPassword);
    res.status(httpStatus.OK).json(ApiResponse.success('Password changed successfully'));
  })
};
