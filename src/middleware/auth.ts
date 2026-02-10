/**
 * Authentication Middleware for Fastify
 * Provides JWT authentication and API key validation
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getAuthService } from '../services/auth.service.js';
import type { PermissionScope, UserRole } from '../models/auth.js';

/**
 * Extend FastifyRequest with auth properties
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: UserRole;
      tenantId?: string;
    };
    apiKey?: {
      id: string;
      name: string;
      scopes: PermissionScope[];
    };
  }
}

/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Authorization error
 */
export class ForbiddenError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

/**
 * Extract token from Authorization header
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;

  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

/**
 * JWT Authentication middleware
 * Validates JWT tokens from Authorization header
 */
export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractToken(request);

  if (!token) {
    throw new AuthError('Missing authorization header', 401);
  }

  try {
    const authService = getAuthService();
    const payload = authService.verifyAccessToken(token);

    // Verify user still exists and is active
    const user = authService.getUserById(payload.sub);
    if (!user) {
      throw new AuthError('User not found', 401);
    }

    if (!user.isActive) {
      throw new AuthError('Account is disabled', 401);
    }

    // Attach user to request
    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError('Invalid or expired token', 401);
  }
}

/**
 * API Key Authentication middleware
 * Validates API keys from Authorization header or X-API-Key header
 */
export async function authenticateAPIKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Try Authorization header first
  const authHeader = request.headers.authorization;
  let apiKey: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  }

  // Try X-API-Key header
  if (!apiKey) {
    apiKey = request.headers['x-api-key'] as string;
  }

  if (!apiKey) {
    throw new AuthError('Missing API key', 401);
  }

  const authService = getAuthService();
  const result = authService.verifyAPIKey(apiKey);

  if (!result) {
    throw new AuthError('Invalid API key', 401);
  }

  // Attach user and API key info to request
  request.user = {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    tenantId: result.user.tenantId,
  };
}

/**
 * Combined authentication (JWT or API Key)
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Try JWT first
  try {
    await authenticateJWT(request, reply);
    return;
  } catch (error) {
    // If JWT fails, try API key
  }

  // Try API key
  try {
    await authenticateAPIKey(request, reply);
  } catch (error) {
    throw new AuthError('Authentication required', 401);
  }
}

/**
 * Require specific role
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new AuthError('Authentication required', 401);
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(`Requires one of roles: ${allowedRoles.join(', ')}`);
    }
  };
}

/**
 * Require specific permission
 */
export function requirePermission(...permissions: PermissionScope[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new AuthError('Authentication required', 401);
    }

    const authService = getAuthService();

    for (const permission of permissions) {
      if (!authService.hasPermission(request.user.role, permission)) {
        throw new ForbiddenError(`Missing required permission: ${permission}`);
      }
    }
  };
}

/**
 * Optional authentication - attaches user if token is valid, but doesn't require it
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractToken(request);

  if (token) {
    try {
      const authService = getAuthService();
      const payload = authService.verifyAccessToken(token);
      const user = authService.getUserById(payload.sub);

      if (user && user.isActive) {
        request.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        };
      }
    } catch {
      // Ignore errors - authentication is optional
    }
  }
}

/**
 * Admin only middleware
 */
export const requireAdmin = requireRole('admin');

/**
 * Editor or admin middleware
 */
export const requireEditor = requireRole('admin', 'editor');

/**
 * Require authenticated user (any role)
 */
export const requireAuth = authenticate;

/**
 * Register auth routes
 */
export async function registerAuthRoutes(
  fastify: any,
  options: { prefix?: string } = {}
): Promise<void> {
  const prefix = options.prefix || '/auth';
  const authService = getAuthService();

  // Register
  fastify.post(`${prefix}/register`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name: string;
    };

    if (!email || !password || !name) {
      return reply.status(400).send({ error: 'Email, password, and name are required' });
    }

    try {
      const user = await authService.register({ email, password, name });
      return reply.status(201).send({ user });
    } catch (error) {
      if (error instanceof Error && error.message === 'Email already registered') {
        return reply.status(409).send({ error: error.message });
      }
      throw error;
    }
  });

  // Login
  fastify.post(`${prefix}/login`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    try {
      const result = await authService.login({ email, password });
      return reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid credentials') {
        return reply.status(401).send({ error: error.message });
      }
      throw error;
    }
  });

  // Refresh token
  fastify.post(`${prefix}/refresh`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = request.body as {
      refreshToken: string;
    };

    if (!refreshToken) {
      return reply.status(400).send({ error: 'Refresh token is required' });
    }

    try {
      const result = await authService.refreshAccessToken(refreshToken);
      return reply.send(result);
    } catch (error) {
      if (error instanceof Error) {
        return reply.status(401).send({ error: error.message });
      }
      throw error;
    }
  });

  // Logout
  fastify.post(`${prefix}/logout`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = request.body as {
      refreshToken: string;
    };

    if (!refreshToken) {
      return reply.status(400).send({ error: 'Refresh token is required' });
    }

    await authService.logout(refreshToken);
    return reply.status(204).send();
  });

  // Get current user
  fastify.get(`${prefix}/me`, {
    onRequest: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = authService.getUserById(request.user!.id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    const { passwordHash: _, ...userWithoutPassword } = user;
    return reply.send({ user: userWithoutPassword });
  });

  // Change password
  fastify.post(`${prefix}/password`, {
    onRequest: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { currentPassword, newPassword } = request.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'Current and new passwords are required' });
    }

    const user = authService.getUserById(request.user!.id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const bcrypt = (await import('bcrypt')).default;
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValid) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    authService.updateUser(user.id, { password: newPassword } as any);
    return reply.status(204).send();
  });

  // API Keys routes
  fastify.get(`${prefix}/api-keys`, {
    onRequest: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKeys = authService.listAPIKeys(request.user!.id);
    // Don't return the keyHash
    const sanitizedKeys = apiKeys.map(k => ({
      id: k.id,
      name: k.name,
      scopes: k.scopes,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      isActive: k.isActive,
    }));
    return reply.send({ apiKeys: sanitizedKeys });
  });

  fastify.post(`${prefix}/api-keys`, {
    onRequest: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, scopes, expiresIn } = request.body as {
      name: string;
      scopes: PermissionScope[];
      expiresIn?: string;
    };

    if (!name || !scopes || !Array.isArray(scopes)) {
      return reply.status(400).send({ error: 'Name and scopes are required' });
    }

    try {
      const { key, apiKey } = await authService.createAPIKey(
        request.user!.id,
        name,
        scopes,
        expiresIn
      );

      // Return the key only once
      const response = {
        apiKey: {
          id: apiKey.id,
          key, // Only show the actual key on creation
          name: apiKey.name,
          scopes: apiKey.scopes,
          createdAt: apiKey.createdAt,
          expiresAt: apiKey.expiresAt,
        },
      };

      return reply.status(201).send(response);
    } catch (error) {
      if (error instanceof Error) {
        return reply.status(400).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.delete(`${prefix}/api-keys/:keyId`, {
    onRequest: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { keyId } = request.params as { keyId: string };

    const success = authService.revokeAPIKey(request.user!.id, keyId);

    if (!success) {
      return reply.status(404).send({ error: 'API key not found' });
    }

    return reply.status(204).send();
  });
}

/**
 * Auth hook for protecting routes
 */
export async function authHook(fastify: any): Promise<void> {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for auth routes and public routes
    const skipPaths = ['/auth', '/health', '/viewer'];
    const isSkip = skipPaths.some(path => request.url.startsWith(path));

    if (isSkip) {
      return;
    }

    // Try optional auth - attach user if valid
    await optionalAuth(request, reply);
  });
}
