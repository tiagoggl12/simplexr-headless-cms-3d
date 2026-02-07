/**
 * Authentication and Authorization Service
 * Handles JWT tokens, password hashing, and API key management
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import type {
  User,
  APIKey,
  RefreshToken,
  JWTPayload,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  PermissionScope,
  AuthConfig,
  UserRole,
} from '../models/auth.js';

const DEFAULT_CONFIG: AuthConfig = {
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
  bcryptRounds: 10,
  apiKeyLength: 32,
};

/**
 * In-memory storage (replace with PostgreSQL in production)
 */
class AuthStore {
  private users = new Map<string, User>();
  private apiKeys = new Map<string, APIKey>();
  private refreshTokens = new Map<string, RefreshToken>();
  private usersByEmail = new Map<string, User>();

  // Users
  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    return this.usersByEmail.get(email.toLowerCase());
  }

  createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const now = new Date().toISOString();
    const newUser: User = {
      ...user,
      id: `user_${randomBytes(16).toString('hex')}`,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(newUser.id, newUser);
    this.usersByEmail.set(newUser.email.toLowerCase(), newUser);
    return newUser;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
    this.users.set(id, updated);
    if (updates.email && updates.email !== user.email) {
      this.usersByEmail.delete(user.email.toLowerCase());
      this.usersByEmail.set(updates.email.toLowerCase(), updated);
    }
    return updated;
  }

  // API Keys
  getApiKeyById(id: string): APIKey | undefined {
    return this.apiKeys.get(id);
  }

  getApiKeysByUserId(userId: string): APIKey[] {
    return Array.from(this.apiKeys.values()).filter(k => k.userId === userId);
  }

  createApiKey(key: Omit<APIKey, 'id' | 'createdAt'>): APIKey {
    const newKey: APIKey = {
      ...key,
      id: `key_${randomBytes(16).toString('hex')}`,
      createdAt: new Date().toISOString(),
    };
    this.apiKeys.set(newKey.id, newKey);
    return newKey;
  }

  revokeApiKey(id: string): boolean {
    const key = this.apiKeys.get(id);
    if (key) {
      key.isActive = false;
      return true;
    }
    return false;
  }

  findApiKeyByHash(keyHash: string): APIKey | undefined {
    return Array.from(this.apiKeys.values()).find(
      k => k.keyHash === keyHash && k.isActive
    );
  }

  // Refresh Tokens
  createRefreshToken(token: Omit<RefreshToken, 'id' | 'createdAt'>): RefreshToken {
    const newToken: RefreshToken = {
      ...token,
      id: `rt_${randomBytes(16).toString('hex')}`,
      createdAt: new Date().toISOString(),
    };
    this.refreshTokens.set(newToken.token, newToken);
    return newToken;
  }

  getRefreshToken(token: string): RefreshToken | undefined {
    return this.refreshTokens.get(token);
  }

  revokeRefreshToken(token: string): boolean {
    const rt = this.refreshTokens.get(token);
    if (rt && !rt.revokedAt) {
      rt.revokedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  revokeAllUserTokens(userId: string): void {
    for (const rt of this.refreshTokens.values()) {
      if (rt.userId === userId && !rt.revokedAt) {
        rt.revokedAt = new Date().toISOString();
      }
    }
  }
}

/**
 * Authentication Service
 */
export class AuthService {
  private store: AuthStore;
  private config: AuthConfig;

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new AuthStore();
    this.createDefaultAdmin();
  }

  /**
   * Create default admin user if no users exist
   */
  private createDefaultAdmin(): void {
    const existing = this.store.getUserByEmail('admin@simplexr.dev');
    if (!existing) {
      const passwordHash = bcrypt.hashSync('admin123', this.config.bcryptRounds);
      this.store.createUser({
        email: 'admin@simplexr.dev',
        passwordHash,
        name: 'Default Admin',
        role: 'admin',
        isActive: true,
      });
      console.log('[Auth] Default admin user created: admin@simplexr.dev / admin123');
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<User> {
    const existing = this.store.getUserByEmail(data.email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, this.config.bcryptRounds);

    const user = this.store.createUser({
      email: data.email,
      passwordHash,
      name: data.name,
      role: 'viewer', // Default role
      isActive: true,
    });

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  /**
   * Login user
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    const user = this.store.getUserByEmail(data.email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.isActive) {
      throw new Error('Account is disabled');
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    this.store.updateUser(user.id, { lastLoginAt: new Date().toISOString() });

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.role, user.tenantId);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    tenantId?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const now = Math.floor(Date.now() / 1000);

    const payload: JWTPayload = {
      sub: userId,
      email,
      role,
      tenantId,
      iat: now,
      exp: now + this.parseExpiration(this.config.jwtExpiresIn),
    };

    const accessToken = jwt.sign(payload, this.config.jwtSecret);

    // Create refresh token
    const refreshTokenValue = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.parseExpiration(this.config.refreshExpiresIn) * 1000).toISOString();

    this.store.createRefreshToken({
      token: refreshTokenValue,
      userId,
      expiresAt,
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const token = this.store.getRefreshToken(refreshToken);

    if (!token) {
      throw new Error('Invalid refresh token');
    }

    if (token.revokedAt) {
      throw new Error('Refresh token revoked');
    }

    if (new Date(token.expiresAt) < new Date()) {
      throw new Error('Refresh token expired');
    }

    const user = this.store.getUserById(token.userId);
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    // Revoke old refresh token and generate new tokens
    this.store.revokeRefreshToken(refreshToken);
    return this.generateTokens(user.id, user.email, user.role, user.tenantId);
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    this.store.revokeRefreshToken(refreshToken);
  }

  /**
   * Verify JWT token and return payload
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.config.jwtSecret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Create API key
   */
  async createAPIKey(
    userId: string,
    name: string,
    scopes: PermissionScope[],
    expiresIn?: string
  ): Promise<{ key: string; apiKey: APIKey }> {
    const user = this.store.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const key = randomBytes(this.config.apiKeyLength).toString('hex');
    const keyHash = createHash('sha256').update(key).digest('hex');

    let expiresAt: string | undefined;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + this.parseExpiration(expiresIn) * 1000).toISOString();
    }

    const apiKey = this.store.createApiKey({
      keyHash,
      userId,
      name,
      scopes,
      expiresAt,
      isActive: true,
    });

    // Return raw key only once
    return { key, apiKey };
  }

  /**
   * Verify API key and return user
   */
  verifyAPIKey(key: string): { user: User; scopes: PermissionScope[] } | null {
    const keyHash = createHash('sha256').update(key).digest('hex');
    const apiKey = this.store.findApiKeyByHash(keyHash);

    if (!apiKey) {
      return null;
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return null;
    }

    const user = this.store.getUserById(apiKey.userId);
    if (!user || !user.isActive) {
      return null;
    }

    // Update last used
    apiKey.lastUsedAt = new Date().toISOString();

    return { user, scopes: apiKey.scopes };
  }

  /**
   * List user's API keys
   */
  listAPIKeys(userId: string): APIKey[] {
    return this.store.getApiKeysByUserId(userId);
  }

  /**
   * Revoke API key
   */
  revokeAPIKey(userId: string, keyId: string): boolean {
    const key = this.store.getApiKeyById(keyId);
    if (key && key.userId === userId) {
      return this.store.revokeApiKey(keyId);
    }
    return false;
  }

  /**
   * Check if user has permission
   */
  hasPermission(role: UserRole, permission: PermissionScope): boolean {
    const permissions: Record<UserRole, PermissionScope[]> = {
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
    return permissions[role].includes(permission) || permissions[role].includes('admin:all');
  }

  /**
   * Parse expiration string to seconds
   */
  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${expiration}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return value * multipliers[unit];
  }

  /**
   * Get user by ID
   */
  getUserById(id: string): User | undefined {
    return this.store.getUserById(id);
  }

  /**
   * Get user by email
   */
  getUserByEmail(email: string): User | undefined {
    return this.store.getUserByEmail(email);
  }

  /**
   * Get all users (admin only)
   */
  getAllUsers(): User[] {
    return Array.from(this.store['users'].values()).map(u => {
      const { passwordHash: _, ...user } = u;
      return user as User;
    });
  }

  /**
   * Update user
   */
  updateUser(id: string, updates: Partial<User>): User | undefined {
    if (updates.password) {
      updates.passwordHash = bcrypt.hashSync(updates.password, this.config.bcryptRounds);
      delete updates.password;
    }
    return this.store.updateUser(id, updates);
  }

  /**
   * Delete user
   */
  deleteUser(id: string): boolean {
    const user = this.store.getUserById(id);
    if (!user) return false;

    this.store['users'].delete(id);
    this.store['usersByEmail'].delete(user.email.toLowerCase());
    this.store.revokeAllUserTokens(id);

    // Revoke all API keys
    for (const key of this.store['apiKeys'].values()) {
      if (key.userId === id) {
        key.isActive = false;
      }
    }

    return true;
  }
}

/**
 * Create auth service instance
 */
export function createAuthService(config?: Partial<AuthConfig>): AuthService {
  return new AuthService(config);
}

/**
 * Singleton instance
 */
let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}
