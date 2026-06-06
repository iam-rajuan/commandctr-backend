export class ApiResponse {
  static success<T>(message: string, data?: T) {
    return {
      success: true,
      message,
      data: data ?? null
    };
  }

  static error(message: string, errors?: unknown) {
    return {
      success: false,
      message,
      errors: errors ?? null
    };
  }
}
