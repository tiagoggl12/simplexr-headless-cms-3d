/**
 * Workflow Routes
 * API endpoints for asset lifecycle workflow management
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getWorkflowService } from '../services/workflow.service.js';
import type { WorkflowStatus, UserRole } from '../models/workflow.js';

// Validation schemas
const statusChangeSchema = z.object({
  status: z.enum(['draft', 'review', 'approved', 'published', 'archived', 'deleted', 'rejected']),
  comment: z.string().optional(),
  force: z.boolean().optional().default(false),
});

const reviewDecisionSchema = z.object({
  approved: z.boolean(),
  comment: z.string().optional(),
});

const publishSchema = z.object({
  scheduledAt: z.string().optional(),
  comment: z.string().optional(),
});

const unpublishSchema = z.object({
  reason: z.string().optional(),
});

/**
 * Helper to get user role from request
 * In production, this would come from JWT/Auth middleware
 */
function getUserRole(request: any): UserRole {
  const auth = request.headers['x-user-role'];
  if (auth === 'admin') return 'admin';
  if (auth === 'editor') return 'editor';
  return 'viewer';
}

function getUserId(request: any): string {
  return request.headers['x-user-id'] || 'anonymous';
}

function getUserName(request: any): string | undefined {
  return request.headers['x-user-name'];
}

/**
 * Register workflow routes
 */
export async function registerWorkflowRoutes(
  app: FastifyInstance,
  options: { prefix?: string } = {}
): Promise<void> {
  const prefix = options.prefix || '/workflow';
  const service = getWorkflowService();

  // GET /workflow/assets/:id - Get workflow state for an asset
  app.get(`${prefix}/assets/:id`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const userRole = getUserRole(request);

    const state = service.getWorkflowState(assetId, userRole);
    return reply.send(state);
  });

  // GET /workflow/assets/:id/allowed-transitions - Get allowed status transitions
  app.get(`${prefix}/assets/:id/allowed-transitions`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const userRole = getUserRole(request);

    const state = service.getWorkflowState(assetId, userRole);
    return reply.send({
      assetId,
      currentStatus: state.status,
      allowedTransitions: state.canTransitionTo,
    });
  });

  // POST /workflow/assets/:id/status - Change asset status
  app.post(`${prefix}/assets/:id/status`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = statusChangeSchema.parse(request.body);

    const userRole = getUserRole(request);
    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.changeStatus(assetId, payload, userId, userName, userRole);
      return reply.send(event);
    } catch (error) {
      const err = error as { code?: string; message?: string; details?: any };
      if (err.code === 'INVALID_TRANSITION') {
        return reply.status(400).send({
          error: 'invalid_transition',
          message: err.message,
          details: err.details,
        });
      }
      return reply.status(500).send({ error: err.message || 'Failed to change status' });
    }
  });

  // POST /workflow/assets/:id/submit - Submit asset for review
  app.post(`${prefix}/assets/:id/submit`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = z.object({ comment: z.string().optional() }).parse(request.body);

    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.submitForReview(assetId, payload, userId, userName);
      return reply.send(event);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'INVALID_TRANSITION') {
        return reply.status(400).send({ error: 'invalid_transition', message: err.message });
      }
      return reply.status(500).send({ error: err.message || 'Failed to submit for review' });
    }
  });

  // POST /workflow/assets/:id/approve - Approve asset in review
  app.post(`${prefix}/assets/:id/approve`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = reviewDecisionSchema.parse(request.body);

    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.reviewDecision(assetId, { ...payload, approved: true }, userId, userName);
      return reply.send(event);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'INVALID_TRANSITION') {
        return reply.status(400).send({ error: 'invalid_transition', message: err.message });
      }
      return reply.status(500).send({ error: err.message || 'Failed to approve asset' });
    }
  });

  // POST /workflow/assets/:id/reject - Reject asset in review
  app.post(`${prefix}/assets/:id/reject`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = reviewDecisionSchema.parse(request.body);

    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.reviewDecision(assetId, { ...payload, approved: false }, userId, userName);
      return reply.send(event);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'INVALID_TRANSITION') {
        return reply.status(400).send({ error: 'invalid_transition', message: err.message });
      }
      return reply.status(500).send({ error: err.message || 'Failed to reject asset' });
    }
  });

  // POST /workflow/assets/:id/publish - Publish asset
  app.post(`${prefix}/assets/:id/publish`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = publishSchema.parse(request.body);

    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.publish(assetId, payload, userId, userName);
      return reply.send(event);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'INVALID_TRANSITION') {
        return reply.status(400).send({ error: 'invalid_transition', message: err.message });
      }
      return reply.status(500).send({ error: err.message || 'Failed to publish asset' });
    }
  });

  // POST /workflow/assets/:id/unpublish - Unpublish asset
  app.post(`${prefix}/assets/:id/unpublish`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = unpublishSchema.parse(request.body);

    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.unpublish(assetId, payload, userId, userName);
      return reply.send(event);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'INVALID_TRANSITION') {
        return reply.status(400).send({ error: 'invalid_transition', message: err.message });
      }
      return reply.status(500).send({ error: err.message || 'Failed to unpublish asset' });
    }
  });

  // POST /workflow/assets/:id/archive - Archive asset
  app.post(`${prefix}/assets/:id/archive`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = z.object({ comment: z.string().optional() }).parse(request.body);

    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.archive(assetId, userId, userName, payload.comment);
      return reply.send(event);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to archive asset' });
    }
  });

  // POST /workflow/assets/:id/restore - Restore archived/deleted asset
  app.post(`${prefix}/assets/:id/restore`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;

    const userId = getUserId(request);
    const userName = getUserName(request);

    try {
      const event = await service.restore(assetId, userId, userName);
      return reply.send(event);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to restore asset' });
    }
  });

  // GET /workflow/assets/:id/history - Get workflow history for an asset
  app.get(`${prefix}/assets/:id/history`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;

    const history = service.getHistory(assetId);
    return reply.send({ assetId, history });
  });

  // GET /workflow/statuses - List all assets by status
  app.get(`${prefix}/statuses/:status`, async (request, reply) => {
    const status = (request.params as { status: WorkflowStatus }).status;

    // In production, you'd query actual asset IDs
    // For now, return empty array as placeholder
    return reply.send({
      status,
      assets: service.getAssetsByStatus(status, []),
    });
  });

  // GET /workflow/awaiting-review - Get assets awaiting review
  app.get(`${prefix}/awaiting-review`, async (request, reply) => {
    // In production, you'd query actual asset IDs
    const assetIds = service.getAwaitingReview([]);
    return reply.send({
      assets: assetIds,
      count: assetIds.length,
    });
  });

  // GET /workflow/statistics - Get workflow statistics
  app.get(`${prefix}/statistics`, async (request, reply) => {
    // In production, you'd query actual asset IDs
    const stats = service.getStatistics([]);
    return reply.send(stats);
  });

  // GET /workflow/statuses - Get status display info
  app.get(`${prefix}/statuses`, async (request, reply) => {
    const statusInfo: Record<string, { label: string; color: string; icon: string }> = {};
    const statuses: WorkflowStatus[] = ['draft', 'review', 'approved', 'published', 'archived', 'deleted', 'rejected'];

    for (const status of statuses) {
      statusInfo[status] = service.getStatusDisplay(status);
    }

    return reply.send({ statuses: statusInfo });
  });
}
