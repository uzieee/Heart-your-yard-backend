export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data: T | null;
  statusCode: number;
}

export interface ApiError {
  success: false;
  message: string;
  data: null;
  statusCode: number;
  errors?: Record<string, string[]>;
}

export interface RegisterBody {
  username: string;
  email: string;
  password: string;
  image?: string;
}

export interface CheckUsernameQuery {
  username: string;
}

export interface UsernameAvailability {
  username: string;
  available: boolean;
}








