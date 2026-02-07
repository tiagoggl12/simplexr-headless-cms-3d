import { describe, it, expect, beforeEach } from 'vitest';
import { createAssetVersioningService, type AssetVersion } from '../src/services/asset-versioning.js';
import type { Asset3D } from '../src/models.js';

describe('AssetVersioningService', () => {
  let service: ReturnType<typeof createAssetVersioningService>;
  let mockAsset: Asset3D;

  beforeEach(() => {
    service = createAssetVersioningService();
    mockAsset = {
      id: 'test-asset',
      name: 'Test Asset',
      masterUrl: 'https://example.com/test.glb',
      status: 'draft',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
  });

  describe('createVersion', () => {
    it('should create a version snapshot', () => {
      const version = service.createVersion(mockAsset, 'Initial version');

      expect(version.assetId).toBe('test-asset');
      expect(version.version).toBe(1);
      expect(version.changeDescription).toBe('Initial version');
      expect(version.snapshot).toBeDefined();
    });

    it('should create version with tags', () => {
      const version = service.createVersion(mockAsset, 'Version 1.0', 'user1', ['major', 'v1.0']);

      expect(version.tags).toEqual(['major', 'v1.0']);
      expect(version.createdBy).toBe('user1');
    });

    it('should increment version numbers', () => {
      const v1 = service.createVersion(mockAsset, 'Version 1');
      const v2 = service.createVersion(mockAsset, 'Version 2');

      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
    });
  });

  describe('getVersions', () => {
    it('should return empty array for asset with no versions', () => {
      const versions = service.getVersions('non-existent');
      expect(versions).toEqual([]);
    });

    it('should return all versions for an asset', () => {
      service.createVersion(mockAsset, 'V1');
      service.createVersion(mockAsset, 'V2');

      const versions = service.getVersions('test-asset');

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(1);
      expect(versions[1].version).toBe(2);
    });
  });

  describe('getVersion', () => {
    it('should return specific version', () => {
      service.createVersion(mockAsset, 'V1');

      const version = service.getVersion('test-asset', 1);

      expect(version).toBeDefined();
      expect(version?.version).toBe(1);
    });

    it('should return undefined for non-existent version', () => {
      const version = service.getVersion('test-asset', 99);
      expect(version).toBeUndefined();
    });
  });

  describe('getLatestVersion', () => {
    it('should return undefined for asset with no versions', () => {
      const version = service.getLatestVersion('non-existent');
      expect(version).toBeUndefined();
    });

    it('should return the latest version', () => {
      service.createVersion(mockAsset, 'V1');
      service.createVersion(mockAsset, 'V2');
      service.createVersion(mockAsset, 'V3');

      const version = service.getLatestVersion('test-asset');

      expect(version).toBeDefined();
      expect(version?.version).toBe(3);
    });
  });

  describe('restoreToVersion', () => {
    it('should restore asset to a previous version', () => {
      // Create original version with one name
      service.createVersion(mockAsset, 'Original');

      // Update asset
      const updatedAsset = { ...mockAsset, name: 'Updated Asset' };
      service.createVersion(updatedAsset, 'Update');

      // Restore to version 1
      const restored = service.restoreToVersion('test-asset', 1);

      expect(restored.name).toBe('Test Asset');
    });

    it('should throw error for non-existent asset', () => {
      expect(() => {
        service.restoreToVersion('non-existent', 1);
      }).toThrow();
    });
  });

  describe('compareVersions', () => {
    it('should compare two versions', () => {
      service.createVersion(mockAsset, 'V1');

      const updatedAsset = { ...mockAsset, name: 'Updated Asset' };
      service.createVersion(updatedAsset, 'V2');

      const diff = service.compareVersions('test-asset', 1, 2);

      expect(diff.versionA).toBe(1);
      expect(diff.versionB).toBe(2);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].field).toBe('name');
      expect(diff.changes[0].oldValue).toBe('Test Asset');
      expect(diff.changes[0].newValue).toBe('Updated Asset');
    });
  });

  describe('deleteVersions', () => {
    it('should delete all versions for an asset', () => {
      service.createVersion(mockAsset, 'V1');
      service.createVersion(mockAsset, 'V2');

      service.deleteVersions('test-asset');

      const versions = service.getVersions('test-asset');
      expect(versions).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', () => {
      service.createVersion(mockAsset, 'V1');

      const stats = service.getStatistics();

      expect(stats.totalAssets).toBe(1);
      expect(stats.totalVersions).toBe(1);
      expect(stats.averageVersionsPerAsset).toBe(1);
    });
  });

  describe('autoSnapshot', () => {
    it('should create snapshot on status change', async () => {
      const updates = { status: 'ready' as const };
      const beforeSnapshotCount = service.getVersions('test-asset').length;

      await service.autoSnapshot(mockAsset, updates);

      const afterSnapshotCount = service.getVersions('test-asset').length;
      expect(afterSnapshotCount).toBeGreaterThan(beforeSnapshotCount);
    });
  });

  describe('exportVersions', () => {
    it('should export versions as JSON', () => {
      service.createVersion(mockAsset, 'V1');

      const exported = service.exportVersions('test-asset');

      const data = JSON.parse(exported);
      expect(data.assetId).toBe('test-asset');
      expect(data.versions).toHaveLength(1);
    });
  });

  describe('importVersions', () => {
    it('should import versions from JSON', () => {
      const jsonData = JSON.stringify({
        assetId: 'test-asset',
        exportedAt: new Date().toISOString(),
        versionCount: 1,
        versions: [
          {
            id: 'v1',
            assetId: 'test-asset',
            version: 1,
            snapshot: {
              originalId: 'test-asset',
              originalCreatedAt: '2024-01-01T00:00:00Z',
              originalUpdatedAt: '2024-01-01T00:00:00Z',
              name: 'Test Asset',
              masterUrl: 'https://example.com/test.glb',
              status: 'draft',
            },
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const count = service.importVersions(jsonData);

      expect(count).toBe(1);
      expect(service.getVersions('test-asset')).toHaveLength(1);
    });
  });
});
