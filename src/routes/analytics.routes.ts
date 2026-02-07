/**
 * Analytics Routes
 * API endpoints for asset analytics and metrics
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getAnalyticsService } from '../services/analytics.service.js';

// Validation schemas
const trackViewSchema = z.object({
  sessionId: z.string().optional(),
  duration: z.number().optional(),
  referrer: z.string().optional(),
  userAgent: z.string().optional(),
  context: z.object({
    device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

const trackDownloadSchema = z.object({
  format: z.string().optional(),
  userId: z.string().optional(),
});

const trackShareSchema = z.object({
  platform: z.enum(['email', 'twitter', 'facebook', 'link', 'embed', 'other']),
  userId: z.string().optional(),
});

/**
 * Helper to get client IP from request
 */
function getClientIp(request: any): string | undefined {
  return request.headers['x-forwarded-for'] as string || request.ip;
}

/**
 * Register analytics routes
 */
export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  options: { prefix?: string } = {}
): Promise<void> {
  const prefix = options.prefix || '/analytics';
  const service = getAnalyticsService();

  // GET /analytics/dashboard - Get dashboard data
  app.get(`${prefix}/dashboard`, async (request, reply) => {
    const dashboard = service.getDashboardData();
    return reply.send(dashboard);
  });

  // GET /analytics/summary - Get analytics summary
  app.get(`${prefix}/summary`, async (request, reply) => {
    const summary = service.getSummary();
    return reply.send(summary);
  });

  // GET /analytics/popular - Get popular assets
  app.get(`${prefix}/popular`, async (request, reply) => {
    const query = request.query as {
      limit?: string;
      time_range?: 'day' | 'week' | 'month' | 'year' | 'all';
      sort_by?: 'views' | 'downloads' | 'trending';
      category?: string;
    };

    const limit = query.limit ? parseInt(query.limit, 10) : 20;

    const assets = service.getPopularAssets({
      limit,
      timeRange: query.time_range,
      sortBy: query.sort_by,
      category: query.category,
    });

    return reply.send({ assets });
  });

  // GET /analytics/trending - Get trending assets
  app.get(`${prefix}/trending`, async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 10;

    const assets = service.getTrendingAssets(limit);
    return reply.send({ assets });
  });

  // GET /analytics/unviewed - Get unviewed assets
  app.get(`${prefix}/unviewed`, async (request, reply) => {
    // In production, you'd pass actual asset IDs
    const assetIds: string[] = [];
    const unviewed = service.getUnviewedAssets(assetIds);
    return reply.send({ assetIds: unviewed, count: unviewed.length });
  });

  // GET /analytics/assets/:id/metrics - Get metrics for a specific asset
  app.get(`${prefix}/assets/:id/metrics`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;

    const metrics = service.getMetrics(assetId);
    return reply.send(metrics);
  });

  // GET /analytics/assets/:id/timeseries - Get time series data for an asset
  app.get(`${prefix}/assets/:id/timeseries`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const query = request.query as {
      aggregation?: 'hour' | 'day' | 'week' | 'month' | 'year';
      limit?: string;
    };

    const aggregation = query.aggregation || 'day';
    const limit = query.limit ? parseInt(query.limit, 10) : 30;

    const timeSeries = service.getTimeSeries(assetId, aggregation, limit);
    return reply.send({ assetId, timeSeries });
  });

  // POST /analytics/assets/:id/view - Track a view event
  app.post(`${prefix}/assets/:id/view`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = trackViewSchema.parse(request.body);

    // Get user info from auth in production
    const userId = (request as any).user?.id;
    const clientIp = getClientIp(request);

    const view = service.trackView(assetId, payload, userId, clientIp);
    return reply.status(201).send(view);
  });

  // POST /analytics/assets/:id/download - Track a download event
  app.post(`${prefix}/assets/:id/download`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = trackDownloadSchema.parse(request.body);

    const clientIp = getClientIp(request);

    service.trackDownload(assetId, payload, clientIp);
    return reply.status(201).send({ message: 'Download tracked' });
  });

  // POST /analytics/assets/:id/share - Track a share event
  app.post(`${prefix}/assets/:id/share`, async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = trackShareSchema.parse(request.body);

    const clientIp = getClientIp(request);
    const userId = (request as any).user?.id;

    service.trackShare(assetId, payload, clientIp);
    return reply.status(201).send({ message: 'Share tracked' });
  });

  // GET /analytics/statistics - Get global statistics
  app.get(`${prefix}/statistics`, async (request, reply) => {
    const summary = service.getSummary();
    return reply.send({
      totalAssets: summary.totalAssets,
      totalViews: summary.totalViews,
      totalDownloads: summary.totalDownloads,
      avgViewDuration: summary.avgViewDuration,
      unviewedAssets: summary.unviewedAssets,
      activeUsers: Math.round(summary.totalViews * 0.6), // Simulated
    });
  });

  // POST /analytics/cleanup - Cleanup old analytics data
  app.post(`${prefix}/cleanup`, async (request, reply) => {
    const payload = z.object({
      retention_days: z.number().min(1).optional().default(90),
    }).parse(request.body);

    service.cleanup(payload.retention_days);
    return reply.send({ message: 'Cleanup completed', retentionDays: payload.retention_days });
  });
}
