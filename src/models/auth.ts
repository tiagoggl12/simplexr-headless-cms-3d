/**
 * Authentication and Authorization Models
 */

/**
 * User roles for RBAC
 */
export type UserRole = 'admin' | 'editor' | 'viewer';

/**
 * User account
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string; // bcrypt hash
  name: string;
  role: UserRole;
  tenantId?: string; // For multi-tenancy
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

/**
 * API Key for programmatic access
 */
export interface APIKey {
  id: string;
  keyHash: string; // SHA-256 hash of the key
  userId: string;
  name: string; // Human-readable name
  scopes: string[]; // ['assets:read', 'assets:write', ...]
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  isActive: boolean;
}

/**
 * JWT Payload
 */
export interface JWTPayload {
  sub: string; // User ID
  email: string;
  role: UserRole;
  tenantId?: string;
  iat: number;
  exp: number;
}

/**
 * Refresh token for session management
 */
export interface RefreshToken {
  id: string;
  token: string; // Secure random token
  userId: string;
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
}

/**
 * OAuth account linkage
 */
export interface OAuthAccount {
  id: string;
  userId: string;
  provider: 'google' | 'github' | 'microsoft';
  providerAccountId: string;
  createdAt: string;
}

/**
 * Permission scopes
 */
export type PermissionScope =
  | 'assets:read'
  | 'assets:write'
  | 'assets:delete'
  | 'presets:read'
  | 'presets:write'
  | 'presets:delete'
  | 'variants:read'
  | 'variants:write'
  | 'variants:delete'
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'analytics:read'
  | 'webhooks:manage'
  | 'admin:all';

/**
 * Role permissions mapping
 */
export const ROLE_PERMISSIONS: Record<UserRole, PermissionScope[]> = {
  admin: [
    'assets:read', 'assets:write', 'assets:delete',
    'presets:read', 'presets:write', 'presets:delete',
    'variants:read', 'variants:write', 'variants:delete',
    'users:read', 'users:write', 'users:delete',
    'analytics:read',
    'webhooks:manage',
    'admin:all',
  ],
  editor: [
    'assets:read', 'assets:write',
    'presets:read', 'presets:write',
    'variants:read', 'variants:write',
    'analytics:read',
  ],
  viewer: [
    'assets:read',
    'presets:read',
    'variants:read',
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: PermissionScope): boolean {
  return ROLE_PERMISSIONS[role].includes(permission) || ROLE_PERMISSIONS[role].includes('admin:all');
}

/**
 * Login request
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

/**
 * Register request
 */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

/**
 * Auth configuration
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string; // e.g., "15m", "1h"
  refreshExpiresIn: string; // e.g., "7d", "30d"
  bcryptRounds: number;
  apiKeyLength: number; // bytes
}
