import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessingService } from '../src/services/processing.js';
import { MemoryStore } from '../src/store.js';
import type { Asset3D } from '../src/models.js';

// Mock the queue service
const mockQueue = {
  compressKTX2: async () => {},
  generateLODs: async () => {},
  enqueue: async () => {},
};

describe('ProcessingService V3', () => {
  let store: MemoryStore;
  let service: ProcessingService;

  const mockAsset: Asset3D = {
    id: 'test-asset',
    name: 'Test Asset',
    masterUrl: 'https://example.com/test.glb',
    status: 'draft',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    store = new MemoryStore();
    store.createAsset(mockAsset);
    service = new ProcessingService(store, mockQueue as any);
  });

  describe('V3 Pipeline Configuration', () => {
    it('should have V3 features enabled by default', () => {
      const config = service.getConfig();

      expect(config.enableKTX2).toBe(true);
      expect(config.enableLODs).toBe(true);
      expect(config.ktx2Quality).toBe(8);
      expect(config.lodLevels).toBe(3);
    });

    it('should allow disabling V3 features', () => {
      service.updateConfig({
        enableKTX2: false,
        enableLODs: false,
      });

      const config = service.getConfig();
      expect(config.enableKTX2).toBe(false);
      expect(config.enableLODs).toBe(false);
    });
  });

  describe('KTX2 Compression', () => {
    it('should update processing status when enqueuing KTX2 job', async () => {
      await service.enqueueKTX2Compression(mockAsset.id, mockAsset.masterUrl);

      const updated = store.getAsset(mockAsset.id);
      expect(updated?.processingStatus?.ktx2).toBe('pending');
    });

    it('should handle KTX2 compression errors gracefully', async () => {
      // The actual KTX2 processor is a stub, so it will fail to fetch
      const result = await service.compressKTX2(mockAsset.id, 'https://invalid-url.glb');

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');

      const updated = store.getAsset(mockAsset.id);
      expect(updated?.processingStatus?.ktx2).toBe('failed');
    });

    it('should enqueue background job for KTX2 compression with options', async () => {
      await service.enqueueKTX2Compression(mockAsset.id, mockAsset.masterUrl, {
        quality: 10,
      });

      const updated = store.getAsset(mockAsset.id);
      expect(updated?.processingStatus?.ktx2).toBe('pending');
    });
  });

  describe('LOD Generation', () => {
    it('should update processing status when enqueuing LOD job', async () => {
      await service.enqueueLODGeneration(mockAsset.id, mockAsset.masterUrl);

      const updated = store.getAsset(mockAsset.id);
      expect(updated?.processingStatus?.lods).toBe('pending');
    });

    it('should handle LOD generation errors gracefully', async () => {
      // The actual LOD generator is a stub, so it will fail to fetch
      const result = await service.generateLODs(mockAsset.id, 'https://invalid-url.glb');

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');

      const updated = store.getAsset(mockAsset.id);
      expect(updated?.processingStatus?.lods).toBe('failed');
    });

    it('should enqueue background job for LOD generation with options', async () => {
      await service.enqueueLODGeneration(mockAsset.id, mockAsset.masterUrl, {
        applyWeld: true,
      });

      const updated = store.getAsset(mockAsset.id);
      expect(updated?.processingStatus?.lods).toBe('pending');
    });
  });

  describe('V3 Pipeline', () => {
    it('should handle V3 pipeline with both KTX2 and LOD disabled', async () => {
      service.updateConfig({
        enableKTX2: false,
        enableLODs: false,
      });

      // Should not throw when V3 features are disabled
      await service.runV3Pipeline(mockAsset.id, mockAsset.masterUrl);

      // Asset should remain in its current status (draft -> not ready because no processing ran)
      const updated = store.getAsset(mockAsset.id);
      expect(updated?.status).toBe('draft');
    });
  });
});
