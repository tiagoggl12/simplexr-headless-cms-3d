/**
 * Axios Configuration for SimpleXR DAM Admin
 * Provides centralized HTTP client with interceptors for error handling
 * and request/response transformations.
 */

import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_TIMEOUT = 30000;

// Retry configuration
const RETRY_CONFIG = {
  retries: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
};

// Custom error types
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message: string = 'Network error occurred') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Extended config with metadata
interface ExtendedConfig extends InternalAxiosRequestConfig {
  _startTime?: number;
  _retryCount?: number;
}

/**
 * Create and configure Axios instance with interceptors
 */
function createAxiosInstance(): AxiosInstance {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  instance.interceptors.request.use(
    (config: ExtendedConfig) => {
      // Add auth token if available
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Add request timestamp for debugging
      config._startTime = Date.now();

      return config;
    },
    (error: AxiosError) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      // Log request duration in development
      if (import.meta.env.DEV) {
        const config = response.config as ExtendedConfig;
        const duration = Date.now() - (config._startTime || 0);
        console.debug(
          `[API] ${String(response.config.method).toUpperCase()} ${response.config.url} - ${duration}ms`
        );
      }

      return response;
    },
    async (error: AxiosError) => {
      const config = error.config as ExtendedConfig | undefined;

      // Handle retry for network errors
      if (axios.isAxiosError(error) && !error.response && config) {
        const retryCount = config._retryCount || 0;

        if (retryCount < RETRY_CONFIG.retries) {
          config._retryCount = retryCount + 1;

          const delay = RETRY_CONFIG.retryDelay(retryCount);
          await new Promise((resolve) => setTimeout(resolve, delay));

          return instance.request(config);
        }
      }

      // Transform error to custom error type
      const transformedError = transformError(error);

      return Promise.reject(transformedError);
    }
  );

  return instance;
}

/**
 * Transform Axios error to custom error type
 */
function transformError(error: AxiosError): ApiError | NetworkError | ValidationError {
  if (!error.response) {
    return new NetworkError(
      error.message || 'Network error. Please check your connection.'
    );
  }

  const statusCode = error.response.status;
  const data = error.response.data as Record<string, unknown>;
  const message = (data?.message as string) || (data?.error as string) || error.message;
  const code = (data?.code as string) || `http_${statusCode}`;

  // Handle validation errors (422)
  if (statusCode === 422 && data?.errors) {
    return new ValidationError(
      message || 'Validation failed',
      data.errors as Record<string, string[]>
    );
  }

  return new ApiError(message || 'An error occurred', statusCode, code, data);
}

/**
 * API client instance
 */
export const apiClient = createAxiosInstance();

// Export for external usage
export default apiClient;
