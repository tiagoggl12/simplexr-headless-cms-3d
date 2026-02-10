import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../src/store.js';
import { RenderManifestService } from '../src/services/render-manifest.js';
import { LocalStorageService } from '../src/services/storage.js';
import { CDNService } from '../src/services/cdn-service.js';
import type { Asset3D, LODLevel, TextureFormat } from '../src/models.js';

describe('V3 Integration Tests', () => {
  let store: MemoryStore;
  let storage: LocalStorageService;
  let cdnService: CDNService;
  let manifestService: RenderManifestService;

  beforeEach(() => {
    store = new MemoryStore();
    storage = new LocalStorageService('s3://bucket');
    cdnService = new CDNService({
      enabled: true,
      provider: 'custom',
      endpoint: 'https://cdn.example.com',
      cacheRules: {
        ktx2: 'public, max-age=31536000, immutable',
        lods: 'public, max-age=86400, stale-while-revalidate=3600',
        glb: 'public, max-age=3600',
        thumbnails: 'public, max-age=604800',
        default: 'public, max-age=3600',
      },
    });

    // Create a store adapter for the manifest service
    const storeAdapter = {
      async getAsset(id: string) {
        return store.getAsset(id);
      },
      async getLightingPreset(id: string) {
        return store.getLightingPreset(id);
      },
      async getRenderPreset(id: string) {
        return store.getRenderPreset(id);
      },
      async getMaterialVariant(id: string) {
        return store.getMaterialVariant(id);
      },
    };

    manifestService = new RenderManifestService(storeAdapter, storage, cdnService);
  });

  describe('Render Manifest v2.0', () => {
    let assetWithKTX2: Asset3D;
    let assetWithLODs: Asset3D;
    let assetWithBoth: Asset3D;
    let baseAsset: Asset3D;

    beforeEach(() => {
      // Base asset without V3 features
      baseAsset = {
        id: 'asset-base',
        name: 'Base Asset',
        masterUrl: 'https://s3.amazonaws.com/bucket/base.glb',
        status: 'ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      store.createAsset(baseAsset);

      // Asset with KTX2 textures
      const ktx2Format: TextureFormat = {
        format: 'ktx2',
        url: 'https://s3.amazonaws.com/bucket/ktx2/asset.ktx2.glb',
        size: 1024000,
        compressedSize: 256000,
      };

      assetWithKTX2 = {
        id: 'asset-ktx2',
        name: 'KTX2 Asset',
        masterUrl: 'https://s3.amazonaws.com/bucket/ktx2/asset.glb',
        status: 'ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        textureFormats: [ktx2Format],
        processingStatus: { ktx2: 'ready' },
      };
      store.createAsset(assetWithKTX2);

      // Asset with LODs
      const lods: LODLevel[] = [
        {
          level: 0,
          url: 'https://s3.amazonaws.com/bucket/lods/asset.lod0.glb',
          vertexCount: 10000,
          fileSize: 1024000,
          distance: 0,
        },
        {
          level: 1,
          url: 'https://s3.amazonaws.com/bucket/lods/asset.lod1.glb',
          vertexCount: 5000,
          fileSize: 512000,
          distance: 10,
        },
        {
          level: 2,
          url: 'https://s3.amazonaws.com/bucket/lods/asset.lod2.glb',
          vertexCount: 2500,
          fileSize: 256000,
          distance: 50,
        },
      ];

      assetWithLODs = {
        id: 'asset-lods',
        name: 'LOD Asset',
        masterUrl: 'https://s3.amazonaws.com/bucket/lods/asset.glb',
        status: 'ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lods,
        processingStatus: { lods: 'ready' },
      };
      store.createAsset(assetWithLODs);

      // Asset with both KTX2 and LODs
      assetWithBoth = {
        id: 'asset-both',
        name: 'Full V3 Asset',
        masterUrl: 'https://s3.amazonaws.com/bucket/both/asset.glb',
        status: 'ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        textureFormats: [ktx2Format],
        lods,
        processingStatus: { ktx2: 'ready', lods: 'ready' },
      };
      store.createAsset(assetWithBoth);
    });

    describe('v1.0 fallback for base assets', () => {
      it('should generate v1.0 manifest for base asset', async () => {
        const manifest = await manifestService.generateDefault('asset-base');

        expect(manifest.version).toBe('1.0');
        expect(manifest.manifest.asset.format).toBe('glb');
        expect(manifest.manifest.asset.formats).toBeUndefined();
      });
    });

    describe('v2.0 with KTX2', () => {
      it('should generate v2.0 manifest when format=ktx2 is requested', async () => {
        const manifest = await manifestService.generateDefault('asset-ktx2', 'desktop', {
          format: 'ktx2',
        });

        expect(manifest.version).toBe('2.0');
        expect(manifest.manifest.asset.formats?.ktx2).toBe('https://cdn.example.com/ktx2/asset.ktx2.glb');
      });

      it('should include KTX2 in capabilities when available', async () => {
        const manifest = await manifestService.generateDefault('asset-ktx2', 'desktop', {
          format: 'ktx2',
        });

        expect(manifest.manifest.asset.capabilities?.ktx2).toBe(true);
      });
    });

    describe('v2.0 with LODs', () => {
      it('should generate v2.0 manifest when maxLod is requested', async () => {
        const manifest = await manifestService.generateDefault('asset-lods', 'desktop', {
          maxLod: 2,
        });

        expect(manifest.version).toBe('2.0');
        expect(manifest.manifest.asset.formats?.lods).toBeDefined();
        expect(manifest.manifest.asset.formats?.lods).toHaveLength(3);
      });

      it('should filter LODs based on maxLod', async () => {
        const manifest = await manifestService.generateDefault('asset-lods', 'desktop', {
          maxLod: 1,
        });

        expect(manifest.manifest.asset.formats?.lods).toHaveLength(2);
        expect(manifest.manifest.asset.formats?.lods?.[0].level).toBe(0);
        expect(manifest.manifest.asset.formats?.lods?.[1].level).toBe(1);
      });

      it('should transform LOD URLs to CDN URLs', async () => {
        const manifest = await manifestService.generateDefault('asset-lods', 'desktop', {
          maxLod: 2,
        });

        expect(manifest.manifest.asset.formats?.lods?.[0].url).toBe('https://cdn.example.com/lods/asset.lod0.glb');
      });

      it('should include LOD capabilities', async () => {
        const manifest = await manifestService.generateDefault('asset-lods', 'desktop', {
          maxLod: 2,
        });

        expect(manifest.manifest.asset.capabilities?.lods).toBe(true);
        expect(manifest.manifest.asset.capabilities?.maxLodLevel).toBe(2);
      });
    });

    describe('v2.0 with both KTX2 and LODs', () => {
      it('should include both formats in manifest', async () => {
        const manifest = await manifestService.generateDefault('asset-both', 'desktop', {
          format: 'ktx2',
          maxLod: 2,
        });

        expect(manifest.version).toBe('2.0');
        expect(manifest.manifest.asset.formats?.ktx2).toBeDefined();
        expect(manifest.manifest.asset.formats?.lods).toBeDefined();
      });

      it('should have all capabilities enabled', async () => {
        const manifest = await manifestService.generateDefault('asset-both', 'desktop', {
          format: 'ktx2',
          maxLod: 2,
        });

        expect(manifest.manifest.asset.capabilities?.ktx2).toBe(true);
        expect(manifest.manifest.asset.capabilities?.lods).toBe(true);
        expect(manifest.manifest.asset.capabilities?.maxLodLevel).toBe(2);
      });
    });

    describe('CDN URL transformation', () => {
      it('should keep original S3 URL in v1.0 manifest for base assets', async () => {
        const manifest = await manifestService.generateDefault('asset-base', 'desktop');

        // v1.0 manifest doesn't use CDN transformation
        expect(manifest.version).toBe('1.0');
        expect(manifest.manifest.asset.url).toBe('https://s3.amazonaws.com/bucket/base.glb');
      });

      it('should transform primary URL to CDN URL in v2.0 manifest', async () => {
        const manifest = await manifestService.generateDefault('asset-lods', 'desktop', {
          maxLod: 1,
        });

        expect(manifest.version).toBe('2.0');
        expect(manifest.manifest.asset.url).toBe('https://cdn.example.com/lods/asset.glb');
      });

      it('should transform all asset URLs to CDN URLs', async () => {
        const manifest = await manifestService.generateDefault('asset-both', 'desktop', {
          format: 'ktx2',
          maxLod: 2,
        });

        expect(manifest.manifest.asset.url).toMatch(/^https:\/\/cdn\.example\.com\//);
        expect(manifest.manifest.asset.formats?.ktx2).toMatch(/^https:\/\/cdn\.example\.com\//);
        expect(manifest.manifest.asset.formats?.lods?.[0].url).toMatch(/^https:\/\/cdn\.example\.com\//);
      });
    });

    describe('preferKtx2 option', () => {
      it('should use KTX2 as primary when preferKtx2 is true', async () => {
        const manifest = await manifestService.generate({
          assetId: 'asset-ktx2',
          preferKtx2: true,
        });

        expect(manifest.version).toBe('2.0');
        expect(manifest.manifest.asset.format).toBe('ktx2');
      });

      it('should use GLB as primary when preferKtx2 is false, but still return v2.0 for capabilities', async () => {
        const manifest = await manifestService.generate({
          assetId: 'asset-ktx2',
          preferKtx2: false,
        });

        // Returns v2.0 because the asset has KTX2 capability
        expect(manifest.version).toBe('2.0');
        expect(manifest.manifest.asset.format).toBe('glb');
        expect(manifest.manifest.asset.capabilities?.ktx2).toBe(true);
      });

      it('should return v1.0 for base asset without V3 features', async () => {
        const manifest = await manifestService.generate({
          assetId: 'asset-base',
          preferKtx2: false,
        });

        expect(manifest.version).toBe('1.0');
        expect(manifest.manifest.asset.format).toBe('glb');
        expect(manifest.manifest.asset.capabilities).toBeUndefined();
      });
    });
  });
});
