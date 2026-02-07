/**
 * Export Routes
 * API endpoints for multi-format export functionality
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getExportService } from '../services/export.service.js';

// Validation schemas
const createExportSchema = z.object({
  format: z.enum(['gltf', 'glb', 'obj', 'usdz', 'stl', 'fbx']),
  options: z.object({
    scale: z.number().optional(),
    upAxis: z.enum(['y', 'z']).optional(),
    applyTransforms: z.boolean().optional(),
    separateBuffers: z.boolean().optional(),
    embedBuffers: z.boolean().optional(),
    dracoCompression: z.boolean().optional(),
    textureFormat: z.enum(['jpeg', 'png', 'original', 'ktx2']).optional(),
    maxTextureSize: z.number().optional(),
    includeMaterials: z.boolean().optional(),
    includeNormals: z.boolean().optional(),
    includeUVs: z.boolean().optional(),
    mtlFile: z.boolean().optional(),
    separateObjects: z.boolean().optional(),
    usdzVersion: z.string().optional(),
    arkitCompatible: z.boolean().optional(),
    binary: z.boolean().optional(),
    includeColor: z.boolean().optional(),
    fbxVersion: z.string().optional(),
    embedMedia: z.boolean().optional(),
  }).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  webhookUrl: z.string().url().optional(),
});

/**
 * Register export routes
 */
export async function registerExportRoutes(
  app: FastifyInstance,
  options: { prefix?: string } = {}
): Promise<void> {
  const prefix = options.prefix || '/exports';
  const service = getExportService();

  // GET /exports/capabilities - Get all export format capabilities
  app.get(`${prefix}/capabilities`, async (request, reply) => {
    const capabilities = service.getAllCapabilities();
    return reply.send(capabilities);
  });

  // GET /exports/capabilities/:format - Get specific format capabilities
  app.get(`${prefix}/capabilities/:format`, async (request, reply) => {
    const format = (request.params as { format: string }).format as any;

    const capabilities = service.getFormatCapabilities(format);

    if (!capabilities) {
      return reply.status(404).send({ error: 'format_not_supported' });
    }

    return reply.send(capabilities);
  });

  // GET /exports/statistics - Get export statistics
  app.get(`${prefix}/statistics`, async (request, reply) => {
    const stats = service.getStatistics();
    return reply.send(stats);
  });

  // POST /assets/:id/exports - Create export job for an asset
  app.post('/assets/:id/exports', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;
    const payload = createExportSchema.parse(request.body);

    // Get asset to verify it exists and get master URL
    // In production, this would query the store
    const masterUrl = `https://storage.example.com/assets/${assetId}/master.glb`;

    try {
      const job = await service.createExport(assetId, masterUrl, payload);
      return reply.status(201).send(job);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'INVALID_OPTIONS') {
        return reply.status(400).send({ error: 'invalid_options', message: err.message });
      }
      return reply.status(500).send({ error: err.message || 'Failed to create export job' });
    }
  });

  // GET /assets/:id/exports - List export jobs for an asset
  app.get('/assets/:id/exports', async (request, reply) => {
    const assetId = (request.params as { id: string }).id;

    const jobs = service.getAssetExports(assetId);
    return reply.send({ assetId, jobs });
  });

  // GET /exports/:id - Get export job status
  app.get(`${prefix}/:id`, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const job = service.getJob(id);

    if (!job) {
      return reply.status(404).send({ error: 'export_job_not_found' });
    }

    return reply.send(job);
  });

  // GET /exports/:id/download - Get download URL for completed export
  app.get(`${prefix}/:id/download`, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const job = service.getJob(id);

    if (!job) {
      return reply.status(404).send({ error: 'export_job_not_found' });
    }

    if (job.status !== 'completed') {
      return reply.status(400).send({ error: 'export_not_completed', status: job.status });
    }

    if (!job.resultUrl) {
      return reply.status(404).send({ error: 'download_url_not_available' });
    }

    return reply.send({
      exportId: id,
      downloadUrl: job.resultUrl,
      files: job.resultFiles,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    });
  });

  // DELETE /exports/:id - Cancel or delete export job
  app.delete(`${prefix}/:id`, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const query = request.query as { cancel?: string };

    if (query.cancel === 'true') {
      const cancelled = await service.cancelJob(id);
      if (!cancelled) {
        return reply.status(404).send({ error: 'export_job_not_found' });
      }
      const job = service.getJob(id);
      return reply.send(job);
    }

    const deleted = service.deleteJob(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'export_job_not_found' });
    }

    return reply.status(204).send();
  });

  // POST /exports/:id/retry - Retry failed export
  app.post(`${prefix}/:id/retry`, async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const job = service.getJob(id);

    if (!job) {
      return reply.status(404).send({ error: 'export_job_not_found' });
    }

    if (job.status === 'processing') {
      return reply.status(400).send({ error: 'export_already_processing' });
    }

    // Create new export job with same parameters
    const masterUrl = `https://storage.example.com/assets/${job.assetId}/master.glb`;

    try {
      const newJob = await service.createExport(job.assetId, masterUrl, {
        format: job.format,
        options: job.options,
      });

      return reply.status(201).send(newJob);
    } catch (error) {
      const err = error as { message?: string };
      return reply.status(500).send({ error: err.message || 'Failed to retry export' });
    }
  });
}
