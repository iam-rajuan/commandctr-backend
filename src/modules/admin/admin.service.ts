import { userService } from '@/modules/users/user.service';

export const adminService = {
  getUsers: () => userService.getAll(),
  getUserById: (userId: string) => userService.getById(userId),
  blockUser: (userId: string) => userService.updateStatus(userId, 'blocked'),
  unblockUser: (userId: string) => userService.updateStatus(userId, 'active'),
  deleteUser: (userId: string) => userService.deleteUser(userId)
};
