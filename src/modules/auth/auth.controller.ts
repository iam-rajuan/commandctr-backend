import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { authService } from './auth.service';

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(httpStatus.CREATED).json(ApiResponse.success('Registration successful', result));
  }),
  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Login successful', result));
  }),
  refreshToken: asyncHandler(async (req, res) => {
    const result = await authService.refreshToken(req.body.refreshToken);
    res.status(httpStatus.OK).json(ApiResponse.success('Access token refreshed successfully', result));
  }),
  logout: asyncHandler(async (_req, res) => {
    res.status(httpStatus.OK).json(ApiResponse.success('Logout successful'));
  }),
  me: asyncHandler(async (req, res) => {
    const result = await authService.getMe(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Authenticated user fetched successfully', result));
  })
};
