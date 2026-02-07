import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../src/services/auth.service.js';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService({ jwtSecret: 'test-secret' });
  });

  describe('User Registration', () => {
    it('should register a new user', async () => {
      const user = await service.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe('viewer');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('should not allow duplicate email', async () => {
      await service.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      await expect(service.register({
        email: 'test@example.com',
        password: 'password456',
        name: 'Another User',
      })).rejects.toThrow('Email already registered');
    });

    it('should set default role as viewer', async () => {
      const user = await service.register({
        email: 'viewer@example.com',
        password: 'password123',
        name: 'Viewer User',
      });

      expect(user.role).toBe('viewer');
    });
  });

  describe('User Login', () => {
    it('should login with valid credentials', async () => {
      await service.register({
        email: 'login@example.com',
        password: 'password123',
        name: 'Login User',
      });

      const result = await service.login({
        email: 'login@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('login@example.com');
      expect(result.user.role).toBe('viewer');
    });

    it('should not login with invalid credentials', async () => {
      await service.register({
        email: 'login@example.com',
        password: 'password123',
        name: 'Login User',
      });

      await expect(service.login({
        email: 'login@example.com',
        password: 'wrongpassword',
      })).rejects.toThrow('Invalid credentials');
    });

    it('should not login non-existent user', async () => {
      await expect(service.login({
        email: 'nonexistent@example.com',
        password: 'password123',
      })).rejects.toThrow('Invalid credentials');
    });

    it('should update last login time on successful login', async () => {
      const user = await service.register({
        email: 'lastlogin@example.com',
        password: 'password123',
        name: 'Last Login User',
      });

      await service.login({
        email: 'lastlogin@example.com',
        password: 'password123',
      });

      const updatedUser = service.getUserById(user.id);
      expect(updatedUser?.lastLoginAt).toBeTruthy();
    });
  });

  describe('JWT Tokens', () => {
    it('should verify valid JWT token', async () => {
      await service.register({
        email: 'jwt@example.com',
        password: 'password123',
        name: 'JWT User',
      });

      const result = await service.login({
        email: 'jwt@example.com',
        password: 'password123',
      });

      const payload = service.verifyAccessToken(result.accessToken);

      expect(payload.sub).toBe(result.user.id);
      expect(payload.email).toBe('jwt@example.com');
      expect(payload.role).toBe('viewer');
    });

    it('should reject invalid JWT token', () => {
      expect(() => {
        service.verifyAccessToken('invalid.token.here');
      }).toThrow('Invalid or expired token');
    });

    it('should refresh access token', async () => {
      // First register the user
      await service.register({
        email: 'jwt@example.com',
        password: 'password123',
        name: 'JWT User',
      });

      // Then login to get tokens
      const { refreshToken } = await service.login({
        email: 'jwt@example.com',
        password: 'password123',
      });

      const result = await service.refreshAccessToken(refreshToken);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });
  });

  describe('API Keys', () => {
    it('should create API key', async () => {
      const user = await service.register({
        email: 'apikey@example.com',
        password: 'password123',
        name: 'API Key User',
      });

      const { key, apiKey } = await service.createAPIKey(
        user.id,
        'Test Key',
        ['assets:read', 'assets:write']
      );

      expect(key).toHaveLength(64); // 32 bytes * 2 (hex)
      expect(apiKey.name).toBe('Test Key');
      expect(apiKey.scopes).toEqual(['assets:read', 'assets:write']);
      expect(apiKey.userId).toBe(user.id);
    });

    it('should verify API key', async () => {
      const user = await service.register({
        email: 'apikey@example.com',
        password: 'password123',
        name: 'API Key User',
      });

      const { key } = await service.createAPIKey(
        user.id,
        'Test Key',
        ['assets:read']
      );

      const result = service.verifyAPIKey(key);

      expect(result).toBeTruthy();
      expect(result?.user.id).toBe(user.id);
      expect(result?.scopes).toEqual(['assets:read']);
    });

    it('should list user API keys', async () => {
      const user = await service.register({
        email: 'apikey@example.com',
        password: 'password123',
        name: 'API Key User',
      });

      await service.createAPIKey(user.id, 'Key 1', ['assets:read']);
      await service.createAPIKey(user.id, 'Key 2', ['assets:write']);

      const apiKeys = service.listAPIKeys(user.id);

      expect(apiKeys).toHaveLength(2);
    });

    it('should revoke API key', async () => {
      const user = await service.register({
        email: 'apikey@example.com',
        password: 'password123',
        name: 'API Key User',
      });

      const { apiKey } = await service.createAPIKey(
        user.id,
        'Test Key',
        ['assets:read']
      );

      const revoked = service.revokeAPIKey(user.id, apiKey.id);

      expect(revoked).toBe(true);

      const result = service.verifyAPIKey('invalid-key');
      expect(result).toBeNull();
    });
  });

  describe('Permissions', () => {
    it('admin should have all permissions', () => {
      const permissions = [
        'assets:read', 'assets:write', 'assets:delete',
        'users:write', 'users:delete',
        'admin:all',
      ];

      for (const permission of permissions) {
        expect(service.hasPermission('admin', permission as any)).toBe(true);
      }
    });

    it('viewer should only have read permissions', () => {
      expect(service.hasPermission('viewer', 'assets:read' as any)).toBe(true);
      expect(service.hasPermission('viewer', 'assets:write' as any)).toBe(false);
      expect(service.hasPermission('viewer', 'users:write' as any)).toBe(false);
    });

    it('editor should have read and write permissions', () => {
      expect(service.hasPermission('editor', 'assets:read' as any)).toBe(true);
      expect(service.hasPermission('editor', 'assets:write' as any)).toBe(true);
      expect(service.hasPermission('editor', 'assets:delete' as any)).toBe(false);
      expect(service.hasPermission('editor', 'users:write' as any)).toBe(false);
    });
  });

  describe('Default Admin User', () => {
    it('should create default admin user on init', async () => {
      const admin = service.getUserByEmail('admin@simplexr.dev');

      expect(admin).toBeTruthy();
      expect(admin?.role).toBe('admin');
      expect(admin?.email).toBe('admin@simplexr.dev');
    });

    it('default admin should be able to login', async () => {
      const result = await service.login({
        email: 'admin@simplexr.dev',
        password: 'admin123',
      });

      expect(result.user.role).toBe('admin');
    });
  });

  describe('User Management', () => {
    it('should get all users (admin)', () => {
      const users = service.getAllUsers();

      expect(users.length).toBeGreaterThan(0);
      expect(users.every(u => !u.passwordHash)).toBe(true);
    });

    it('should update user', async () => {
      const user = await service.register({
        email: 'update@example.com',
        password: 'password123',
        name: 'Original Name',
      });

      const updated = service.updateUser(user.id, {
        name: 'Updated Name',
      });

      expect(updated?.name).toBe('Updated Name');
    });

    it('should delete user', async () => {
      const user = await service.register({
        email: 'delete@example.com',
        password: 'password123',
        name: 'Delete Me',
      });

      const deleted = service.deleteUser(user.id);

      expect(deleted).toBe(true);
      expect(service.getUserById(user.id)).toBeUndefined();
    });
  });

  describe('Logout', () => {
    it('should logout by revoking refresh token', async () => {
      // First register the user
      await service.register({
        email: 'logout@example.com',
        password: 'password123',
        name: 'Logout User',
      });

      // Then login to get tokens
      const { refreshToken } = await service.login({
        email: 'logout@example.com',
        password: 'password123',
      });

      await service.logout(refreshToken);

      // Token should be revoked
      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow();
    });
  });
});
