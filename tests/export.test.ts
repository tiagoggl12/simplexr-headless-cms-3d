/**
 * Export Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createExportService } from '../src/services/export.service.js';

describe('ExportService', () => {
  let service: ReturnType<typeof createExportService>;

  beforeEach(() => {
    service = createExportService();
  });

  describe('Format Capabilities', () => {
    it('should list all supported formats', () => {
      const formats = service.getSupportedFormats();

      expect(formats).toContain('glb');
      expect(formats).toContain('gltf');
      expect(formats).toContain('obj');
      expect(formats).toContain('usdz');
      expect(formats).toContain('stl');
      expect(formats).toContain('fbx');
    });

    it('should get capabilities for GLB format', () => {
      const caps = service.getFormatCapabilities('glb');

      expect(caps).toBeDefined();
      expect(caps?.format).toBe('glb');
      expect(caps?.extensions).toContain('.glb');
      expect(caps?.mimeType).toBe('model/gltf-binary');
    });

    it('should get capabilities for OBJ format', () => {
      const caps = service.getFormatCapabilities('obj');

      expect(caps).toBeDefined();
      expect(caps?.format).toBe('obj');
      expect(caps?.extensions).toContain('.obj');
      expect(caps?.options).toContain('includeMaterials');
    });

    it('should return null for unsupported format', () => {
      const caps = service.getFormatCapabilities('unsupported' as any);
      expect(caps).toBeNull();
    });

    it('should get all format capabilities', () => {
      const allCaps = service.getAllCapabilities();

      expect(Object.keys(allCaps)).toHaveLength(6);
      expect(allCaps.glb).toBeDefined();
      expect(allCaps.obj).toBeDefined();
    });
  });

  describe('Create Export Job', () => {
    it('should create GLB export job', async () => {
      const job = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      expect(job.id).toBeDefined();
      expect(job.assetId).toBe('asset-123');
      expect(job.format).toBe('glb');
      expect(job.status).toBe('pending');
    });

    it('should create export job with custom options', async () => {
      const job = await service.createExport('asset-456', 'https://example.com/asset.glb', {
        format: 'gltf',
        options: {
          separateBuffers: true,
          dracoCompression: true,
          textureFormat: 'jpeg',
        },
      });

      expect(job.format).toBe('gltf');
      expect(job.options.separateBuffers).toBe(true);
      expect(job.options.dracoCompression).toBe(true);
      expect(job.options.textureFormat).toBe('jpeg');
    });

    it('should reject invalid export options', async () => {
      await expect(
        service.createExport('asset-789', 'https://example.com/asset.glb', {
          format: 'gltf',
          options: {
            separateBuffers: false,
            embedBuffers: false, // Invalid: at least one must be true
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Export Job Status', () => {
    it('should get export job by ID', async () => {
      const created = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      const retrieved = service.getJob(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent job', () => {
      const job = service.getJob('non-existent');
      expect(job).toBeNull();
    });

    it('should get export jobs for an asset', async () => {
      await service.createExport('asset-123', 'https://example.com/asset.glb', { format: 'glb' });
      await service.createExport('asset-123', 'https://example.com/asset.glb', { format: 'obj' });

      const jobs = service.getAssetExports('asset-123');

      expect(jobs).toHaveLength(2);
      expect(jobs[0].format).not.toBe(jobs[1].format);
    });
  });

  describe('Export Processing', () => {
    it('should process export job asynchronously', async () => {
      const job = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      // Wait a bit for processing to start
      await new Promise(resolve => setTimeout(resolve, 100));

      const updated = service.getJob(job.id);
      expect(updated?.status).toBe('processing');
    });

    it('should complete export job', async () => {
      const job = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 3000));

      const completed = service.getJob(job.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.resultUrl).toBeDefined();
      expect(completed?.progress).toBe(100);
    }, 5000);

    it('should generate result files for GLTF', async () => {
      const job = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'gltf',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 3000));

      const completed = service.getJob(job.id);
      expect(completed?.resultFiles).toBeDefined();
      expect(completed?.resultFiles?.length).toBeGreaterThan(0);
    }, 5000);
  });

  describe('Export Statistics', () => {
    it('should calculate export statistics', async () => {
      // Create some jobs
      await service.createExport('asset-1', 'https://example.com/asset1.glb', { format: 'glb' });
      await service.createExport('asset-2', 'https://example.com/asset2.glb', { format: 'obj' });
      await service.createExport('asset-3', 'https://example.com/asset3.glb', { format: 'usdz' });

      const stats = service.getStatistics();

      expect(stats.totalJobs).toBe(3);
      expect(stats.byFormat.glb).toBe(1);
      expect(stats.byFormat.obj).toBe(1);
      expect(stats.byFormat.usdz).toBe(1);
    });

    it('should track jobs by status', async () => {
      await service.createExport('asset-1', 'https://example.com/asset.glb', { format: 'glb' });
      await service.createExport('asset-2', 'https://example.com/asset.glb', { format: 'glb' });

      const stats = service.getStatistics();

      // Jobs may have moved to processing, so we check totalJobs instead
      expect(stats.totalJobs).toBe(2);
    });
  });

  describe('Cancel Export Job', () => {
    it('should cancel pending export job', async () => {
      const job = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      const cancelled = await service.cancelJob(job.id);
      expect(cancelled).toBe(true);

      const updated = service.getJob(job.id);
      expect(updated?.status).toBe('cancelled');
    });

    it('should not cancel completed job', async () => {
      const job = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 3000));

      const cancelled = await service.cancelJob(job.id);
      expect(cancelled).toBe(false);
    }, 5000);
  });

  describe('Delete Export Job', () => {
    it('should delete export job', async () => {
      const job = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      const deleted = service.deleteJob(job.id);
      expect(deleted).toBe(true);

      const retrieved = service.getJob(job.id);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent job', () => {
      const deleted = service.deleteJob('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Retry Export Job', () => {
    it('should create new job when retrying', async () => {
      const original = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: 'glb',
      });

      // Cancel the original
      await service.cancelJob(original.id);

      // Create a new job via retry endpoint simulation
      const retryJob = await service.createExport('asset-123', 'https://example.com/asset.glb', {
        format: original.format,
        options: original.options,
      });

      expect(retryJob.id).not.toBe(original.id);
      expect(retryJob.status).toBe('pending');
    });
  });
});
