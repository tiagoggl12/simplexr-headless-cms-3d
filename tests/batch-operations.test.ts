import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBatchOperationsService, type BatchOperation } from '../src/services/batch-operations.js';

describe('BatchOperationsService', () => {
  let service: ReturnType<typeof createBatchOperationsService>;

  beforeEach(() => {
    service = createBatchOperationsService();
  });

  describe('createOperation', () => {
    it('should create a batch operation', () => {
      const items = [
        { name: 'Asset 1', masterUrl: 'https://example.com/1.glb' },
        { name: 'Asset 2', masterUrl: 'https://example.com/2.glb' },
      ];

      const operation = service.createOperation('upload', items, {
        continueOnError: true,
        maxConcurrent: 2,
      });

      expect(operation.id).toBeDefined();
      expect(operation.type).toBe('upload');
      expect(operation.status).toBe('pending');
      expect(operation.totalItems).toBe(2);
      expect(operation.items).toHaveLength(2);
      expect(operation.options?.continueOnError).toBe(true);
    });
  });

  describe('executeOperation', () => {
    it('should execute a batch operation successfully', async () => {
      const items = ['item1', 'item2', 'item3'];

      const operation = service.createOperation('upload', items as any);

      const callback = vi.fn().mockResolvedValue({ success: true });

      const result = await service.executeOperation(operation.id, callback as any);

      expect(result.status).toBe('completed');
      expect(result.completedItems).toBe(3);
      expect(result.failedItems).toBe(0);
    });

    it('should handle errors in batch operation', async () => {
      const items = ['item1', 'item2', 'item3'];

      const operation = service.createOperation('upload', items as any);

      const callback = vi.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await service.executeOperation(operation.id, callback as any);

      expect(result.completedItems).toBe(2);
      expect(result.failedItems).toBe(1);
    });
  });

  describe('batchUpload', () => {
    it('should create and execute batch upload', async () => {
      const items = [
        { name: 'Asset 1', masterUrl: 'https://example.com/1.glb' },
      ];

      const creator = vi.fn().mockResolvedValue({
        id: 'new-asset-1',
        name: 'Asset 1',
        masterUrl: 'https://example.com/1.glb',
        status: 'draft' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.batchUpload(items, {}, creator);

      expect(result.status).toBe('completed');
      expect(result.totalItems).toBe(1);
    });
  });

  describe('batchDelete', () => {
    it('should create and execute batch delete', async () => {
      const items = [{ assetId: 'asset-1' }, { assetId: 'asset-2' }];

      const deleter = vi.fn().mockResolvedValue(true);

      const result = await service.batchDelete(items, {}, deleter);

      expect(result.status).toBe('completed');
      expect(result.totalItems).toBe(2);
    });
  });

  describe('batchUpdate', () => {
    it('should create and execute batch update', async () => {
      const items = [
        { assetId: 'asset-1', updates: { name: 'Updated Name' } },
      ];

      const updater = vi.fn().mockResolvedValue({
        id: 'asset-1',
        name: 'Updated Name',
        status: 'draft' as const,
        masterUrl: 'https://example.com/1.glb',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      const result = await service.batchUpdate(items, {}, updater);

      expect(result.status).toBe('completed');
    });
  });

  describe('getOperation', () => {
    it('should get operation by ID', () => {
      const operation = service.createOperation('upload', []);

      const retrieved = service.getOperation(operation.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(operation.id);
    });

    it('should return undefined for non-existent operation', () => {
      const operation = service.getOperation('non-existent');
      expect(operation).toBeUndefined();
    });
  });

  describe('getOperations', () => {
    it('should return all operations', () => {
      service.createOperation('upload', []);
      service.createOperation('delete', []);

      const operations = service.getOperations();

      expect(operations).toHaveLength(2);
    });

    it('should filter operations by type', () => {
      service.createOperation('upload', []);
      service.createOperation('delete', []);

      const uploadOps = service.getOperations('upload' as any);

      expect(uploadOps).toHaveLength(1);
      expect(uploadOps[0].type).toBe('upload');
    });
  });

  describe('cancelOperation', () => {
    it('should cancel a pending operation', () => {
      const operation = service.createOperation('upload', []);

      const cancelled = service.cancelOperation(operation.id);

      expect(cancelled).toBe(true);
      expect(operation.status).toBe('cancelled');
    });

    it('should not cancel a completed operation', () => {
      const operation = service.createOperation('upload', []);
      operation.status = 'completed';

      const cancelled = service.cancelOperation(operation.id);

      expect(cancelled).toBe(false);
    });
  });

  describe('deleteOperation', () => {
    it('should delete an operation', () => {
      const operation = service.createOperation('upload', []);

      const deleted = service.deleteOperation(operation.id);

      expect(deleted).toBe(true);
      expect(service.getOperation(operation.id)).toBeUndefined();
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', () => {
      const operation = service.createOperation('upload', []);

      const stats = service.getStatistics();

      expect(stats.totalOperations).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });

  describe('cleanupOldOperations', () => {
    it('should clean up old operations', () => {
      const operation = service.createOperation('upload', []);
      operation.status = 'completed';
      operation.completedAt = new Date(Date.now() - 100000).toISOString(); // Very old

      const deleted = service.cleanupOldOperations(60000); // 1 minute

      expect(deleted).toBe(1);
      expect(service.getOperations()).toHaveLength(0);
    });
  });
});
