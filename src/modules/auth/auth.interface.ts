import { IUserSafe } from '@/modules/users/user.interface';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin' | 'super_admin';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: IUserSafe;
}
