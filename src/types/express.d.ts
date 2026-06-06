declare namespace Express {
  interface Request {
    requestId: string;
    user?: {
      userId: string;
      email: string;
      role: 'user' | 'admin' | 'super_admin';
    };
  }
}
